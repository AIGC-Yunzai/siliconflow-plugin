"""供 Node.js 调用的抖音解析器；stdout 仅输出 JSON，诊断信息写入 stderr。

分享页与匿名 ttwid 初始化参考 README 感谢中的 astrbot_plugin_parser：
https://github.com/Zhalslar/astrbot_plugin_parser/tree/main/core/parsers/douyin
"""

import asyncio
import json
import re
import sys
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from urllib.parse import parse_qs, quote, urljoin, urlparse

import aiohttp
from yarl import URL


class DouyinParseError(Exception):
    """可直接展示给用户的解析错误。"""


class DouyinParser:
    HOSTS = {
        'douyin.com', 'www.douyin.com', 'v.douyin.com', 'jx.douyin.com',
        'm.douyin.com', 'jingxuan.douyin.com',
        'iesdouyin.com', 'www.iesdouyin.com',
    }
    SHARE_ORIGIN = 'https://www.iesdouyin.com/'
    TTWID_REGISTER_URL = 'https://ttwid.bytedance.com/ttwid/union/register/'

    def __init__(self):
        self.headers = {
            'User-Agent': (
                'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) '
                'AppleWebKit/605.1.15 (KHTML, like Gecko) '
                'Version/16.6 Mobile/15E148 Safari/604.1 Edg/132.0.0.0'
            ),
            'Referer': self.SHARE_ORIGIN,
        }
        self.semaphore = asyncio.Semaphore(10)
        self.errors: List[str] = []

    async def ensure_ttwid(self, session: aiohttp.ClientSession):
        """注册匿名 Cookie，并通过回调写入 iesdouyin.com 域。"""
        share_url = URL(self.SHARE_ORIGIN)
        if session.cookie_jar.filter_cookies(share_url).get('ttwid'):
            return
        payload = {
            'region': 'cn', 'aid': 1768, 'needFid': False,
            'service': 'www.iesdouyin.com', 'union': True, 'fid': '',
        }
        try:
            async with session.post(
                self.TTWID_REGISTER_URL, json=payload, headers=self.headers,
            ) as response:
                response.raise_for_status()
                body = await response.json(content_type=None)
            if not isinstance(body, dict):
                raise ValueError('注册响应不是 JSON 对象')
            if body.get('redirect_url'):
                async with session.get(
                    body['redirect_url'], headers=self.headers, allow_redirects=False,
                ) as response:
                    response.raise_for_status()
            if not session.cookie_jar.filter_cookies(share_url).get('ttwid'):
                raise ValueError('注册响应未设置分享页 Cookie')
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as error:
            raise DouyinParseError('抖音匿名访问初始化失败，请稍后重试') from error

    @staticmethod
    def extract_router_data(text: str) -> Optional[str]:
        """使用 JSON 解码器确定边界，避免标题中的花括号截断数据。"""
        match = re.search(r'window\._ROUTER_DATA\s*=\s*', text)
        if not match:
            return None
        data = text[match.end():]
        _, end = json.JSONDecoder().raw_decode(data)
        return data[:end]

    @classmethod
    def extract_video_reference(cls, url: str) -> Optional[Tuple[str, str]]:
        """只从作品路径或明确的作品 ID 参数读取 ID，忽略分享追踪参数。"""
        parsed = urlparse(url)
        if parsed.hostname not in cls.HOSTS:
            return None
        match = re.fullmatch(r'/(?:share/|m/)?(video|note)/(\d+)/?', parsed.path)
        if match:
            return match.group(1), match.group(2)
        query = parse_qs(parsed.query)
        for key in ('modal_id', 'aweme_id', 'item_ids'):
            value = query.get(key, [''])[0]
            if re.fullmatch(r'\d+', value):
                return 'video', value
        return None

    @classmethod
    def extract_video_links(cls, input_text: str) -> List[str]:
        links = []
        # 提取短码时不带分享文案或中文标点；保留 note 路径。
        pattern = r'https?://(?:[a-zA-Z0-9-]+\.)?(?:douyin|iesdouyin)\.com/[^\s<>"\']*'
        for match in re.finditer(pattern, input_text):
            url = match.group(0).rstrip('.,;!?，。；！？、）)]}》')
            parsed = urlparse(url)
            if parsed.hostname in ('v.douyin.com', 'jx.douyin.com'):
                short_code = re.match(r'/([a-zA-Z0-9_-]+)', parsed.path)
                if not short_code:
                    continue
                url = f'https://{parsed.hostname}/{short_code.group(1)}/'
            else:
                reference = cls.extract_video_reference(url)
                if not reference:
                    continue
                kind, video_id = reference
                url = f'{cls.SHARE_ORIGIN}share/{kind}/{video_id}/'
            if url not in links:
                links.append(url)
        return links

    async def get_redirected_url(self, session: aiohttp.ClientSession, url: str) -> str:
        """用 GET 跟随短链，找到作品 ID 即停止，避免进入登录或风控页。"""
        for _ in range(5):
            if self.extract_video_reference(url):
                return url
            if urlparse(url).hostname not in self.HOSTS:
                break
            async with session.get(
                url, headers=self.headers, allow_redirects=False,
            ) as response:
                response.raise_for_status()
                if response.status not in (301, 302, 303, 307, 308):
                    break
                location = response.headers.get('Location')
                if not location:
                    break
                url = urljoin(url, location)
        if self.extract_video_reference(url):
            return url
        raise DouyinParseError('无法从抖音短链获取作品 ID，链接可能已失效')

    @staticmethod
    def first_url(address: Optional[Dict]) -> Optional[str]:
        for url in (address or {}).get('url_list') or []:
            if isinstance(url, str) and url.startswith(('https://', 'http://')):
                return url
        return None

    async def fetch_video_info(
        self, session: aiohttp.ClientSession, video_id: str, kind: str = 'video',
    ) -> Dict:
        url = f'{self.SHARE_ORIGIN}share/{kind}/{video_id}/'
        async with session.get(url, headers=self.headers) as response:
            response.raise_for_status()
            response_text = await response.text()
        try:
            json_str = self.extract_router_data(response_text)
            if not json_str:
                raise DouyinParseError('抖音未返回分享页数据，请稍后重试')
            json_data = json.loads(json_str)
        except (json.JSONDecodeError, ValueError) as error:
            raise DouyinParseError('抖音分享页数据格式异常') from error

        item = None
        for page in (json_data.get('loaderData') or {}).values():
            if not isinstance(page, dict):
                continue
            items = (page.get('videoInfoRes') or {}).get('item_list') or []
            if items:
                item = items[0]
                break
        if not item:
            raise DouyinParseError('未获取到抖音作品信息，作品可能已删除、设为私密或访问受限')

        images = []
        for img in item.get('images') or []:
            image_url = self.first_url(img)
            if image_url:
                images.append(image_url)
        video = item.get('video') or {}
        play_addr = video.get('play_addr') or {}
        video_url = self.first_url(play_addr)
        if not video_url:
            uri = play_addr.get('uri')
            if uri:
                video_url = uri if uri.startswith(('https://', 'http://')) else (
                    'https://aweme.snssdk.com/aweme/v1/play/'
                    f'?video_id={quote(uri, safe="")}&ratio=720p'
                )
        if video_url:
            video_url = video_url.replace('/playwm/', '/play/')
        if not images and not video_url:
            raise DouyinParseError('抖音作品未返回可下载的视频或图片')

        timestamp = item.get('create_time')
        return {
            'title': item.get('desc') or '',
            'nickname': (item.get('author') or {}).get('nickname') or '未知作者',
            'timestamp': datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d') if timestamp else '',
            'thumb_url': self.first_url(video.get('cover')) or (images[0] if images else None),
            'video_url': video_url,
            'images': images,
            'is_gallery': bool(images),
            'video_id': video_id,
        }

    async def parse_single_url(self, session: aiohttp.ClientSession, url: str) -> Dict:
        async with self.semaphore:
            redirected_url = await self.get_redirected_url(session, url)
            kind, video_id = self.extract_video_reference(redirected_url)
            return await self.fetch_video_info(session, video_id, kind)

    async def parse_urls(self, urls: List[str]) -> List[Dict]:
        self.errors = []
        results = []
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
            # 同一批链接共享匿名 Cookie；aiohttp 按域管理注册与回调的 Cookie。
            await self.ensure_ttwid(session)
            parsed_results = await asyncio.gather(
                *(self.parse_single_url(session, url) for url in urls),
                return_exceptions=True,
            )
            for result in parsed_results:
                if isinstance(result, Exception):
                    message = self.error_message(result)
                    self.errors.append(message)
                    print(f'抖音解析失败: {message}', file=sys.stderr)
                elif result:
                    results.append(result)
        return results

    async def parse_text(self, text: str) -> List[Dict]:
        self.errors = []
        urls = self.extract_video_links(text)
        return await self.parse_urls(urls) if urls else []

    @staticmethod
    def error_message(error: Exception) -> str:
        if isinstance(error, asyncio.TimeoutError):
            return '抖音请求超时，请稍后重试'
        if isinstance(error, aiohttp.ClientResponseError):
            return f'抖音请求失败（HTTP {error.status}），请稍后重试'
        if isinstance(error, aiohttp.ClientError):
            return '无法连接抖音，请检查网络后重试'
        return str(error) or type(error).__name__


def format_result_simple(result: Dict) -> Dict:
    return {
        'title': result['title'],
        'author': result['nickname'],
        'date': result['timestamp'],
        'video_url': result['video_url'],
        'cover_url': result['thumb_url'],
        'images': result['images'],
        'is_gallery': result['is_gallery'],
        'video_id': result['video_id'],
    }


async def main():
    parser = DouyinParser()
    try:
        if len(sys.argv) < 2:
            raise DouyinParseError('用法: python douyin_parser_standalone.py <抖音链接或分享文案>')
        # 比 Node 的 30 秒超时提前结束，保证网络超时也能返回 JSON 错误。
        results = await asyncio.wait_for(parser.parse_text(sys.argv[1]), timeout=25)
        if not results:
            raise DouyinParseError(parser.errors[0] if parser.errors else '未找到有效的抖音链接')
        data = [format_result_simple(result) for result in results]
        output = {'success': True, 'count': len(data), 'data': data}
    except Exception as error:
        message = parser.error_message(error)
        print(f'抖音解析失败: {message}', file=sys.stderr)
        output = {'success': False, 'error': message}
    print(json.dumps(output, ensure_ascii=False))


if __name__ == '__main__':
    asyncio.run(main())
