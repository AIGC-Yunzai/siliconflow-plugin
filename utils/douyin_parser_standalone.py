"""
抖音解析工具 - 独立版本
用于Node.js调用的Python脚本

功能：
1. 提取抖音链接
2. 解析抖音视频信息
3. 获取视频/图片下载链接
"""

import aiohttp
import asyncio
import re
import json
import sys
from datetime import datetime
from typing import List, Dict, Optional, Union

class DouyinParser:
    """抖音解析器 - 独立版本"""
    
    def __init__(self):
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G955U Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
            'Referer': 'https://www.douyin.com/?is_from_mobile_home=1&recommend=1'
        }
        self.semaphore = asyncio.Semaphore(10)

    def extract_router_data(self, text: str) -> Optional[str]:
        """从HTML中提取路由数据"""
        start_flag = 'window._ROUTER_DATA = '
        start_idx = text.find(start_flag)
        if start_idx == -1:
            return None
        
        brace_start = text.find('{', start_idx)
        if brace_start == -1:
            return None
        
        i = brace_start
        stack = []
        while i < len(text):
            if text[i] == '{':
                stack.append('{')
            elif text[i] == '}':
                stack.pop()
                if not stack:
                    return text[brace_start:i+1]
            i += 1
        return None

    async def fetch_video_info(self, session: aiohttp.ClientSession, video_id: str) -> Optional[Dict]:
        """获取视频信息"""
        url = f'https://www.iesdouyin.com/share/video/{video_id}/'
        try:
            async with session.get(url, headers=self.headers) as response:
                response_text = await response.text()
                json_str = self.extract_router_data(response_text)
                if not json_str:
                    print('未找到 _ROUTER_DATA')
                    return None
                
                # 清理JSON字符串
                json_str = json_str.replace('\\u002F', '/').replace('\\/', '/')
                
                try:
                    json_data = json.loads(json_str)
                except Exception as e:
                    print(f'JSON解析失败: {e}')
                    return None
                
                # 提取视频信息
                loader_data = json_data.get('loaderData', {})
                video_info = None
                for v in loader_data.values():
                    if isinstance(v, dict) and 'videoInfoRes' in v:
                        video_info = v['videoInfoRes']
                        break
                
                if not video_info or 'item_list' not in video_info or not video_info['item_list']:
                    print('未找到视频信息')
                    return None
                
                item_list = video_info['item_list'][0]
                title = item_list['desc']
                nickname = item_list['author']['nickname']
                timestamp = datetime.fromtimestamp(item_list['create_time']).strftime('%Y-%m-%d')
                thumb_url = item_list['video']['cover']['url_list'][0]
                
                # 处理视频URL
                video = item_list['video']['play_addr']['uri']
                if video.endswith('.mp3'):
                    video_url = video
                elif video.startswith('https://'):
                    video_url = video
                else:
                    video_url = f'https://www.douyin.com/aweme/v1/play/?video_id={video}'
                
                # 处理图片（图集）
                images = [img['url_list'][0] for img in (item_list.get('images') or []) if 'url_list' in img]
                is_gallery = len(images) > 0
                
                return {
                    'title': title,
                    'nickname': nickname,
                    'timestamp': timestamp,
                    'thumb_url': thumb_url,
                    'video_url': video_url,
                    'images': images,
                    'is_gallery': is_gallery,
                    'video_id': video_id
                }
                
        except aiohttp.ClientError as e:
            print(f'请求错误：{e}')
            return None

    async def get_redirected_url(self, session: aiohttp.ClientSession, url: str) -> str:
        """获取重定向后的URL"""
        async with session.head(url, allow_redirects=True) as response:
            return str(response.url)

    async def parse_single_url(self, session: aiohttp.ClientSession, url: str) -> Optional[Dict]:
        """解析单个抖音链接"""
        async with self.semaphore:
            try:
                redirected_url = await self.get_redirected_url(session, url)
                match = re.search(r'(\d+)', redirected_url)
                if match:
                    video_id = match.group(1)
                    return await self.fetch_video_info(session, video_id)
                else:
                    return None
            except aiohttp.ClientError as e:
                print(f'解析URL失败: {e}')
                return None

    @staticmethod
    def extract_video_links(input_text: str) -> List[str]:
        """从文本中提取抖音链接"""
        result_links = []
        
        # 手机端链接
        mobile_pattern = r'https?://v\.douyin\.com/[^\s]+'
        mobile_links = re.findall(mobile_pattern, input_text)
        result_links.extend(mobile_links)
        
        # 网页端链接
        web_pattern = r'https?://(?:www\.)?douyin\.com/[^\s]*?(\d{19})[^\s]*'
        web_matches = re.finditer(web_pattern, input_text)
        for match in web_matches:
            video_id = match.group(1)
            standardized_url = f"https://www.douyin.com/video/{video_id}"
            result_links.append(standardized_url)
        
        return result_links

    async def parse_urls(self, urls: List[str]) -> List[Dict]:
        """批量解析抖音链接"""
        results = []
        async with aiohttp.ClientSession() as session:
            tasks = [self.parse_single_url(session, url) for url in urls]
            parsed_results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for result in parsed_results:
                if result and not isinstance(result, Exception):
                    results.append(result)
                elif isinstance(result, Exception):
                    print(f'解析失败: {result}')
        
        return results

    async def parse_text(self, text: str) -> List[Dict]:
        """从文本中提取并解析抖音链接"""
        urls = self.extract_video_links(text)
        if not urls:
            return []
        return await self.parse_urls(urls)


def format_result_simple(result: Dict) -> Dict:
    """格式化结果为简单字典"""
    return {
        'title': result['title'],
        'author': result['nickname'],
        'date': result['timestamp'],
        'video_url': result['video_url'],
        'cover_url': result['thumb_url'],
        'images': result['images'],
        'is_gallery': result['is_gallery'],
        'video_id': result['video_id']
    }


async def main():
    """主函数 - 用于命令行调用"""
    if len(sys.argv) < 2:
        print("用法: python douyin_parser.py <抖音链接或包含链接的文本>")
        sys.exit(1)
    
    input_text = sys.argv[1]
    parser = DouyinParser()
    
    try:
        results = await parser.parse_text(input_text)
        if not results:
            print(json.dumps({"error": "未找到有效的抖音链接"}, ensure_ascii=False))
            return
        
        # 格式化结果
        formatted_results = [format_result_simple(result) for result in results]
        
        # 输出JSON结果
        print(json.dumps({
            "success": True,
            "count": len(formatted_results),
            "data": formatted_results
        }, ensure_ascii=False, indent=2))
        
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
