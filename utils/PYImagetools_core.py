import sys
import os
import requests
import re
import base64
import urllib.request
from io import BytesIO

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

try:
    from PIL import ImageFilter, ImageOps, Image
    from PIL.Image import Transpose
    from pil_utils import BuildImage, Text2Image
except ImportError as e:
    print(f"ERROR:IMPORT:{e}")
    sys.exit(1)

def get_image_from_url(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    content = urllib.request.urlopen(req).read()
    return BuildImage.open(BytesIO(content))

# 利用 Base64 进行 stdout 打印传输而不是落地保存为文件
def save_and_print(imgs):
    for i, img in enumerate(imgs):
        try:
            img_bytes = img.save_png().getvalue()
        except Exception:
            # 兼容个别由于类型未匹配时的 fallback 方案
            out = BytesIO()
            img.image.save(out, format="PNG")
            img_bytes = out.getvalue()
        b64 = base64.b64encode(img_bytes).decode('utf-8')
        print(f"BASE64:{b64}")

def save_gif_and_print(bytes_io):
    b64 = base64.b64encode(bytes_io.getvalue()).decode('utf-8')
    print(f"BASE64:{b64}")

def detect_grid_split_points(image, grid_dim):
    if not HAS_NUMPY:
        raise Exception("NUMPY_REQUIRED: 宫格分隔线检测需要 numpy 模块")

    img_array = np.array(image.convert('L')).astype(np.float32)
    h, w = img_array.shape

    vert_grad = np.abs(np.diff(img_array, axis=0))
    horiz_proj = np.sum(vert_grad, axis=1)

    horiz_grad = np.abs(np.diff(img_array, axis=1))
    vert_proj = np.sum(horiz_grad, axis=0)

    window = max(3, min(h, w) // 50)
    kernel = np.ones(window, dtype=np.float32) / window
    vert_proj_s = np.convolve(vert_proj, kernel, mode='same')
    horiz_proj_s = np.convolve(horiz_proj, kernel, mode='same')

    def find_peaks(proj, n_needed, min_dist):
        candidates = []
        for i in range(1, len(proj) - 1):
            if proj[i] > proj[i - 1] and proj[i] >= proj[i + 1]:
                candidates.append((i, proj[i]))
        candidates.sort(key=lambda x: -x[1])
        selected = []
        for pos, val in candidates:
            if all(abs(pos - s) >= min_dist for s, _ in selected):
                selected.append((pos, val))
                if len(selected) == n_needed:
                    break
        selected.sort(key=lambda x: x[0])
        return [p for p, _ in selected]

    n_lines = grid_dim - 1
    min_gap = min(h, w) // (grid_dim * 2)

    v_lines = find_peaks(vert_proj_s, n_lines, min_gap)
    h_lines = find_peaks(horiz_proj_s, n_lines, min_gap)

    if len(v_lines) != n_lines or len(h_lines) != n_lines:
        return None

    col_splits = [0] + [p + 1 for p in v_lines] + [w]
    row_splits = [0] + [p + 1 for p in h_lines] + [h]

    cw = [col_splits[i + 1] - col_splits[i] for i in range(grid_dim)]
    rh = [row_splits[i + 1] - row_splits[i] for i in range(grid_dim)]
    avg_w = sum(cw) / grid_dim
    avg_h = sum(rh) / grid_dim
    if any(x < 0.55 * avg_w for x in cw) or any(x < 0.55 * avg_h for x in rh):
        return None
    if any(x > 1.8 * avg_w for x in cw) or any(x > 1.8 * avg_h for x in rh):
        return None

    return row_splits, col_splits

def _find_content_bbox(frame_img, threshold=30):
    """检测帧内主体内容的 bounding box (x1, y1, x2, y2)。
    通过与四角背景色对比来区分前景主体。
    """
    if not HAS_NUMPY:
        raise Exception("NUMPY_REQUIRED: 主体内容检测需要 numpy 模块")

    img_arr = np.array(frame_img.convert('L'), dtype=np.float32)
    h, w = img_arr.shape
    if h < 4 or w < 4:
        return None

    # 取四角各 3x3 区域的中位数作为背景色估计（抗圆角干扰）
    corner_size = max(2, min(h, w) // 20)
    corners = [
        img_arr[:corner_size, :corner_size],                      # 左上
        img_arr[:corner_size, -corner_size:],                     # 右上
        img_arr[-corner_size:, :corner_size],                     # 左下
        img_arr[-corner_size:, -corner_size:],                    # 右下
    ]
    bg_val = float(np.median(np.concatenate([c.ravel() for c in corners])))

    # 差异大于阈值的像素视为前景
    mask = np.abs(img_arr - bg_val) > threshold

    # 如果前景太少（< 5%），说明可能是纯色帧，返回整帧
    if np.sum(mask) < 0.05 * h * w:
        return (0, 0, w, h)

    # 找前景的最小包围框
    rows_any = np.any(mask, axis=1)
    cols_any = np.any(mask, axis=0)
    row_indices = np.where(rows_any)[0]
    col_indices = np.where(cols_any)[0]
    if len(row_indices) == 0 or len(col_indices) == 0:
        return (0, 0, w, h)

    y1, y2 = int(row_indices[0]), int(row_indices[-1]) + 1
    x1, x2 = int(col_indices[0]), int(col_indices[-1]) + 1
    return (x1, y1, x2, y2)

def _align_frames_by_content(raw_frames, target_size):
    """基于主体质心将所有帧对齐到统一画布，消除帧间抖动。

    算法：
    1. 检测每帧主体 bbox → 计算相对质心比例
    2. 用所有帧质心比例的中位数作为全局锚点（抗离群值）
    3. 将每帧缩放到 target_size，根据质心偏差调整粘贴位置
    4. 返回对齐后的 PIL.Image 帧列表
    """
    if not raw_frames:
        return []
    if not HAS_NUMPY:
        raise Exception("NUMPY_REQUIRED: 帧主体对齐（防抖）需要 numpy 模块")

    # —— 收集每帧的主体质心比例 (cx_ratio, cy_ratio) ——
    cx_ratios = []
    cy_ratios = []
    bboxes = []
    for frame in raw_frames:
        bbox = _find_content_bbox(frame)
        bboxes.append(bbox)
        if bbox:
            x1, y1, x2, y2 = bbox
            cx = (x1 + x2) / 2.0 / frame.width
            cy = (y1 + y2) / 2.0 / frame.height
            cx_ratios.append(cx)
            cy_ratios.append(cy)

    if not cx_ratios:
        return [f.resize((target_size, target_size), Image.LANCZOS) for f in raw_frames]

    # 全局锚点 = 质心比例的中位数
    anchor_cx = float(np.median(cx_ratios))
    anchor_cy = float(np.median(cy_ratios))

    aligned = []
    canvas_center = target_size / 2.0

    for i, frame in enumerate(raw_frames):
        # 先将帧缩放到目标尺寸
        resized = frame.resize((target_size, target_size), Image.LANCZOS)

        bbox = bboxes[i]
        if bbox is None:
            aligned.append(resized)
            continue

        x1, y1, x2, y2 = bbox
        # 当前帧的质心在 target 尺寸下的映射位置
        cx_in_target = ((x1 + x2) / 2.0 / frame.width) * target_size
        cy_in_target = ((y1 + y2) / 2.0 / frame.height) * target_size

        # 锚点在 target 尺寸下的位置
        anchor_x = anchor_cx * target_size
        anchor_y = anchor_cy * target_size

        # 偏移 = 锚点位置 - 当前质心位置（将质心移到锚点）
        offset_x = int(round(anchor_x - cx_in_target))
        offset_y = int(round(anchor_y - cy_in_target))

        # 如果偏移量很小（< 2px），跳过对齐避免不必要的模糊
        if abs(offset_x) < 2 and abs(offset_y) < 2:
            aligned.append(resized)
            continue

        # 限制偏移量，防止主体被移出画布边界
        max_shift = target_size // 8
        offset_x = max(-max_shift, min(max_shift, offset_x))
        offset_y = max(-max_shift, min(max_shift, offset_y))

        # 创建画布并粘贴偏移后的帧
        # 使用与背景色相近的颜色填充（取四角均值）
        bg_bbox = _find_content_bbox(frame, threshold=10)
        if bg_bbox and frame.mode in ('RGB', 'RGBA'):
            arr = np.array(frame.convert('RGB'))
            cs = max(2, min(frame.height, frame.width) // 20)
            bg_r = int(np.median(arr[:cs, :cs, :].reshape(-1, 3), axis=0).mean())
            bg_color = (bg_r, bg_r, bg_r)
        else:
            bg_color = (255, 255, 255)

        canvas = Image.new('RGB', (target_size, target_size), bg_color)
        canvas.paste(resized, (offset_x, offset_y))
        aligned.append(canvas)

    return aligned

def parse_frame_duration(arg):
    if not arg:
        return 300

    p_float = r"\d{1,4}(?:\.\d{1,3})?"
    if match := re.fullmatch(rf"({p_float})ms", arg, re.I):
        duration = float(match.group(1))
    elif match := re.fullmatch(rf"({p_float})s", arg, re.I):
        duration = float(match.group(1)) * 1000
    elif match := re.fullmatch(rf"({p_float})fps", arg, re.I):
        fps = float(match.group(1))
        if fps <= 0:
            raise Exception("请使用正确的帧间隔格式，如：200ms、0.5s、2fps")
        duration = 1000 / fps
    else:
        raise Exception("请使用正确的帧间隔格式，如：200ms、0.5s、2fps")

    if duration <= 0:
        raise Exception("请使用正确的帧间隔格式，如：200ms、0.5s、2fps")
    return max(20, int(round(duration)))

def parse_grid_gif_args(arg):
    parts = arg.split()
    if not parts or parts[0] not in ["4", "9", "16", "25", "36"]:
        raise Exception("请提供宫格数量：#宫格转gif 4/9/16/25/36 [200ms/0.5s/2fps]")
    if len(parts) > 2:
        raise Exception("请使用正确格式：#宫格转gif 4/9/16/25/36 [200ms/0.5s/2fps]")

    total = int(parts[0])
    grid_size = {4: 2, 9: 3, 16: 4, 25: 5, 36: 6}[total]
    duration = parse_frame_duration(parts[1] if len(parts) == 2 else "")
    return grid_size, duration

def process_image():
    cmd = sys.argv[1]
    arg = sys.argv[2]
    urls = sys.argv[3:]

    # 预加载图片
    imgs = []
    if cmd != "文字转图":
        for u in urls:
            try:
                imgs.append(get_image_from_url(u))
            except Exception as e:
                pass
        
        if not imgs:
            print("ERROR: 无法获取图片")
            return

    try:
        if cmd in ["水平翻转", "左翻", "右翻"]:
            res = imgs[0].image.transpose(Transpose.FLIP_LEFT_RIGHT)
            save_and_print([BuildImage(res)])
            
        elif cmd in ["竖直翻转", "上翻", "下翻"]:
            res = imgs[0].image.transpose(Transpose.FLIP_TOP_BOTTOM)
            save_and_print([BuildImage(res)])
            
        elif cmd in ["灰度图", "黑白"]:
            res = imgs[0].image.convert("L")
            save_and_print([BuildImage(res)])
            
        elif cmd == "旋转":
            angle = int(arg) if arg.isdigit() else 90
            res = imgs[0].image.rotate(angle, expand=True)
            save_and_print([BuildImage(res)])
            
        elif cmd == "反相" or cmd == "反色":
            img = imgs[0]
            result = BuildImage.new("RGB", img.size, "white")
            result.paste(img, alpha=True)
            res = ImageOps.invert(result.image)
            save_and_print([BuildImage(res)])
            
        elif cmd == "轮廓":
            res = imgs[0].image.filter(ImageFilter.CONTOUR)
            save_and_print([BuildImage(res)])
            
        elif cmd == "浮雕":
            res = imgs[0].image.filter(ImageFilter.EMBOSS)
            save_and_print([BuildImage(res)])
            
        elif cmd == "模糊":
            res = imgs[0].image.filter(ImageFilter.BLUR)
            save_and_print([BuildImage(res)])
            
        elif cmd == "锐化":
            res = imgs[0].image.filter(ImageFilter.SHARPEN)
            save_and_print([BuildImage(res)])

        elif cmd == "缩放":
            w, h = imgs[0].size
            match1 = re.fullmatch(r"(\d{1,4})?[*xX, ](\d{1,4})?", arg)
            match2 = re.fullmatch(r"(\d{1,3})%", arg)
            if match1:
                nw, nh = match1.group(1), match1.group(2)
                if not nw and nh: imgs[0].resize_height(int(nh))
                elif nw and not nh: imgs[0].resize_width(int(nw))
                elif nw and nh: imgs[0].resize((int(nw), int(nh)))
            elif match2:
                ratio = int(match2.group(1)) / 100
                imgs[0].resize((int(w * ratio), int(h * ratio)))
            save_and_print([imgs[0]])

        elif cmd == "裁剪":
            w, h = imgs[0].size
            match1 = re.fullmatch(r"(\d{1,4})[*xX, ](\d{1,4})", arg)
            match2 = re.fullmatch(r"(\d{1,2})[:：比](\d{1,2})", arg)
            if match1:
                nw, nh = int(match1.group(1)), int(match1.group(2))
                res = imgs[0].resize_canvas((nw, nh), bg_color="white")
            elif match2:
                wp, hp = int(match2.group(1)), int(match2.group(2))
                size = min(w / wp, h / hp)
                res = imgs[0].resize_canvas((int(wp * size), int(hp * size)), bg_color="white")
            else:
                raise Exception("请使用正确的裁剪格式，如：100x100、2:1")
            save_and_print([res])

        elif cmd == "像素化":
            num = int(arg) if arg and arg.isdigit() else 8
            img = imgs[0].image
            res = img.resize((max(1, img.width // num), max(1, img.height // num)), resample=0)
            res = res.resize(img.size, resample=0)
            save_and_print([BuildImage(res)])

        elif cmd in ["gif倒放", "倒放"]:
            image = imgs[0].image
            if not getattr(image, "is_animated", False):
                raise Exception("非GIF图片")
            frames = []
            for i in range(image.n_frames):
                image.seek(i)
                frames.append(image.copy())
            frames = frames[::-1]
            out = BytesIO()
            frames[0].save(out, format="GIF", save_all=True, append_images=frames[1:], loop=0, duration=image.info.get("duration", 20))
            save_gif_and_print(out)

        elif cmd == "gif变速":
            image = imgs[0].image
            if not getattr(image, "is_animated", False):
                raise Exception("非GIF图片")
            
            total_duration = 0
            n_frames = getattr(image, "n_frames", 1)
            for i in range(n_frames):
                image.seek(i)
                total_duration += image.info.get("duration", 20)
            duration = total_duration / n_frames
            
            p_float = r"\d{0,3}\.?\d{1,3}"
            if match := re.fullmatch(rf"({p_float})(?:x|X|倍速?)", arg):
                duration /= float(match.group(1))
            elif match := re.fullmatch(rf"({p_float})%", arg):
                duration /= float(match.group(1)) / 100
            elif match := re.fullmatch(rf"({p_float})fps", arg, re.I):
                duration = 1000 / float(match.group(1))
            elif match := re.fullmatch(rf"({p_float})(m?)s", arg, re.I):
                duration = float(match.group(1)) if match.group(2) else float(match.group(1)) * 1000
            else:
                raise Exception("请使用正确的倍率格式，如：0.5x、50%、20FPS、0.05s")
            
            # 限制最小帧间隔防止 gif 过快而造成显示异常
            duration = max(20, duration) 

            frames = []
            for i in range(n_frames):
                image.seek(i)
                frames.append(image.copy())
            
            out = BytesIO()
            frames[0].save(out, format="GIF", save_all=True, append_images=frames[1:], loop=0, duration=duration)
            save_gif_and_print(out)

        elif cmd == "宫格转gif":
            grid_size, duration = parse_grid_gif_args(arg)
            image = imgs[0].image.convert('RGB')
            img_w, img_h = image.size

            # 放宽正方形限制：允许宽高比在 0.8~1.25 范围内
            aspect = img_w / img_h if img_h > 0 else 1
            if aspect < 0.5 or aspect > 2.0:
                raise Exception("宫格转gif 需要接近正方形的宫格图片（宽高比不超过 2:1）")

            # —— 第一步：智能检测分隔线位置（强依赖 numpy）——
            split_result = detect_grid_split_points(image, grid_size)

            raw_frames = []
            if split_result:
                # 使用检测到的精确分割点切割（避开分隔线）
                row_splits, col_splits = split_result
                for row in range(grid_size):
                    for col in range(grid_size):
                        left = col_splits[col]
                        top = row_splits[row]
                        right = col_splits[col + 1]
                        bottom = row_splits[row + 1]
                        frame = image.crop((left, top, right, bottom)).copy()
                        raw_frames.append(frame)
            else:
                # 回退：基于较短边做均等切割
                base_side = min(img_w, img_h)
                usable_side = base_side - (base_side % grid_size)
                if usable_side < grid_size:
                    raise Exception("图片尺寸过小，无法切分宫格")

                offset_x = (img_w - usable_side) // 2
                offset_y = (img_h - usable_side) // 2
                cropped = image.crop((offset_x, offset_y,
                                      offset_x + usable_side, offset_y + usable_side))

                frame_size = usable_side // grid_size
                for row in range(grid_size):
                    for col in range(grid_size):
                        left = col * frame_size
                        top = row * frame_size
                        frame = cropped.crop((left, top,
                                             left + frame_size, top + frame_size)).copy()
                        raw_frames.append(frame)

            if not raw_frames:
                raise Exception("切分宫格失败，未获取到有效帧")

            # —— 第二步：统一尺寸 + 主体对齐（防抖核心）——
            # 目标尺寸取所有帧面积中位数的边长（到达此处 numpy 已确保可用）
            areas = [f.width * f.height for f in raw_frames]
            median_area = float(np.median(areas))
            target_size = int(round(median_area ** 0.5))
            target_size = max(target_size, 16)  # 安全下限

            frames = _align_frames_by_content(raw_frames, target_size)

            # —— 第三步：转换为 P 模式并输出 GIF ——
            gif_frames = []
            for f in frames:
                if isinstance(f, Image.Image):
                    gif_frames.append(f.convert('RGB').quantize(colors=256, method=2))
                else:
                    gif_frames.append(f)

            out = BytesIO()
            gif_frames[0].save(
                out, format="GIF", save_all=True,
                append_images=gif_frames[1:],
                loop=0, duration=duration,
                optimize=False
            )
            save_gif_and_print(out)
            
        elif cmd == "四宫格":
            img = imgs[0].square()
            a = img.width // 2
            boxes = [(0,0,a,a), (a,0,a*2,a), (0,a,a,a*2), (a,a,a*2,a*2)]
            out_imgs = [BuildImage(img.image.crop(b)) for b in boxes]
            save_and_print(out_imgs)

        elif cmd == "九宫格":
            img = imgs[0].square()
            w, a = img.width, img.width // 3
            boxes = [(0,0,a,a), (a,0,a*2,a), (a*2,0,w,a), (0,a,a,a*2), (a,a,a*2,a*2), (a*2,a,w,a*2), (0,a*2,a,w), (a,a*2,a*2,w), (a*2,a*2,w,w)]
            out_imgs = [BuildImage(img.image.crop(b)) for b in boxes]
            save_and_print(out_imgs)
            
        elif cmd == "横向拼接":
            if len(imgs) < 2: raise Exception("横向拼接需要2张以上图片")
            min_h = min([img.height for img in imgs])
            scaled = [img.resize((img.width * min_h // img.height, min_h)) for img in imgs]
            img_w = sum([img.width for img in scaled])
            frame = BuildImage.new("RGB", (img_w, min_h), "white")
            x = 0
            for img in scaled:
                frame.paste(img, (x, 0))
                x += img.width
            save_and_print([frame])

        elif cmd == "纵向拼接":
            if len(imgs) < 2: raise Exception("纵向拼接需要2张以上图片")
            min_w = min([img.width for img in imgs])
            scaled = [img.resize((min_w, img.height * min_w // img.width)) for img in imgs]
            img_h = sum([img.height for img in scaled])
            frame = BuildImage.new("RGB", (min_w, img_h), "white")
            y = 0
            for img in scaled:
                frame.paste(img, (0, y))
                y += img.height
            save_and_print([frame])

        elif cmd == "文字转图":
            t2i = Text2Image.from_text(arg, 30)
            img = t2i.to_image(bg_color="white", padding=(20, 20))
            save_and_print([BuildImage(img)])

    except Exception as e:
        print(f"ERROR: {str(e)}")

if __name__ == "__main__":
    process_image()
