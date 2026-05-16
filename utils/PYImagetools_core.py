import sys
import os
import requests
import re
import base64
import urllib.request
from io import BytesIO

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