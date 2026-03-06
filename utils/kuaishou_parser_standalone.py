# -*- coding: utf-8 -*-
import sys
import re
import json
import random
import time
import requests

IOS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Referer": "https://v.kuaishou.com/"
}

def parse_kuaishou(text):
    try:
        # 1. 从文本中提取出有效的URL
        url_pattern = re.compile(r'(https?://(?:v\.kuaishou\.com|www\.kuaishou\.com|kuaishou\.com|v\.m\.chenzhongtech\.com)[A-Za-z\d._?%&+\-=/#]+)')
        match = url_pattern.search(text)
        if not match:
            return {"success": False, "error": "未能在文本中找到有效的快手链接"}
        
        origin_url = match.group(1)

        # 2. 获取重定向的真实地址 (短链转长链)
        session = requests.Session()
        resp = session.get(origin_url, headers=IOS_HEADERS, allow_redirects=True, timeout=10)
        real_url = resp.url

        # /fw/long-video/ 返回的HTML结构不一样, 统一替换为 /fw/photo/ 请求
        real_url = real_url.replace("/fw/long-video/", "/fw/photo/")

        # 3. 获取网页源代码
        resp = session.get(real_url, headers=IOS_HEADERS, timeout=10)
        resp.encoding = 'utf-8'
        html_text = resp.text

        # 4. 正则提取 window.INIT_STATE JSON 数据
        pattern = re.compile(r"window\.INIT_STATE\s*=\s*(.*?)</script>", re.DOTALL)
        matched = pattern.search(html_text)
        
        if not matched:
            return {"success": False, "error": "未能从网页中解析到 INIT_STATE 数据"}
        
        json_str = matched.group(1).strip()
        init_state = json.loads(json_str)

        # 5. 遍历 INIT_STATE，找到包含 'photo' 键的字典
        photo_data = None
        for key, value in init_state.items():
            if isinstance(value, dict) and value.get("photo") is not None:
                photo_data = value["photo"]
                break
                
        if not photo_data:
            return {"success": False, "error": "数据中不包含有效视频或图集信息"}

        # 6. 数据提取与清洗
        title = photo_data.get("caption", "无标题")
        author = photo_data.get("userName", "未知用户").replace("\u3164", "").strip()
        timestamp = photo_data.get("timestamp", int(time.time() * 1000))
        date_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(timestamp / 1000))
        video_id = photo_data.get("photoId", str(timestamp))

        # 解析封面图
        cover_urls_list = photo_data.get("coverUrls",[])
        cover_url = random.choice(cover_urls_list).get("url") if cover_urls_list else None

        # 解析视频
        main_mv_urls_list = photo_data.get("mainMvUrls",[])
        video_url = random.choice(main_mv_urls_list).get("url") if main_mv_urls_list else None

        # 解析图集
        is_gallery = False
        images =[]
        ext_params = photo_data.get("ext_params", {})
        atlas = ext_params.get("atlas", {})
        cdn_list = atlas.get("cdnList", [])
        img_route_list = atlas.get("list",[])
        
        # 如果既有 cdn_list 又有路由列表，说明是图集
        if cdn_list and img_route_list:
            is_gallery = True
            video_url = None # 图集模式清除视频URL
            cdn_host = random.choice(cdn_list).get("cdn", "")
            if cdn_host:
                images =[f"https://{cdn_host}/{route}" for route in img_route_list]

        # 7. 组装返回数据结构 (与你的抖音返回结构保持一致)
        result_item = {
            "title": title,
            "author": author,
            "date": date_str,
            "video_id": video_id,
            "is_gallery": is_gallery,
            "video_url": video_url,
            "cover_url": cover_url,
            "images": images
        }

        return {
            "success": True,
            "data": [result_item]
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) > 1:
        input_text = sys.argv[1]
        result = parse_kuaishou(input_text)
        # 将结果以 JSON 字符串形式打印到标准输出
        print(json.dumps(result, ensure_ascii=False))
    else:
        print(json.dumps({"success": False, "error": "未传入解析链接"}))