"""运行：python3 -m unittest discover -s tests -p 'test_douyin_parser.py'"""

import asyncio
import contextlib
import io
import json
import unittest
from unittest.mock import AsyncMock, patch

import aiohttp
from aiohttp import web

from utils.douyin_parser_standalone import DouyinParser, main


VIDEO_ID = '7692917878014459641'
SHORT_URL = 'https://v.douyin.com/-HVsmtK7zxM/'
SHARE_URL = f'https://www.iesdouyin.com/share/video/{VIDEO_ID}/'


def share_html(item=None, kind='video'):
    page = {'videoInfoRes': {'item_list': [item] if item else []}}
    data = {'loaderData': {'video_layout': None, f'{kind}_(id)/page': page}}
    return '<script>window._ROUTER_DATA = ' + json.dumps(data) + ';</script>'


def video_item():
    return {
        'desc': '含有 } 和 { 以及 "引号" 的标题',
        'author': {'nickname': '测试作者'},
        'create_time': 1720000000,
        'video': {
            'play_addr': {'url_list': [
                'https://aweme.snssdk.com/aweme/v1/playwm/?video_id=test',
            ]},
            'cover': {'url_list': ['https://example.com/cover.jpg']},
        },
    }


class Response:
    def __init__(self, text='', status=200, headers=None):
        self.body = text
        self.status = status
        self.headers = headers or {}

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    async def text(self):
        return self.body

    def raise_for_status(self):
        if self.status >= 400:
            raise aiohttp.ClientResponseError(None, (), status=self.status)


class Session:
    def __init__(self, responses):
        self.responses = iter(responses)
        self.requests = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass

    def get(self, url, **kwargs):
        self.requests.append((url, kwargs))
        return next(self.responses)


class LinkTests(unittest.TestCase):
    def test_gallery_prefers_existing_signed_jpeg_url(self):
        address = {'url_list': [
            'https://example.com/body.webp?signature=webp',
            'https://example.com/body.jpeg?signature=jpeg',
        ]}
        self.assertEqual(
            DouyinParser.first_url(address, prefer_jpeg=True), address['url_list'][1],
        )

    def test_user_share_text_and_duplicate_short_links(self):
        text = f'5.30 BGI:/ k@p.QX 09/21 原神又上央视了 {SHORT_URL}复制此链接！ {SHORT_URL}'
        self.assertEqual(DouyinParser.extract_video_links(text), [SHORT_URL])

    def test_video_note_mobile_and_modal_links(self):
        cases = [
            (f'https://www.douyin.com/video/{VIDEO_ID}', 'video'),
            (f'https://www.douyin.com/note/{VIDEO_ID}', 'note'),
            (f'https://m.douyin.com/share/note/{VIDEO_ID}/', 'note'),
            (f'https://www.douyin.com/?from=123&modal_id={VIDEO_ID}', 'video'),
            (SHARE_URL, 'video'),
        ]
        for url, kind in cases:
            with self.subTest(url=url):
                self.assertEqual(
                    DouyinParser.extract_video_links(f'链接：{url}。'),
                    [f'https://www.iesdouyin.com/share/{kind}/{VIDEO_ID}/'],
                )

    def test_tracking_numbers_are_not_video_ids(self):
        for url in (
            'https://v.douyin.com/abc123/?from=6383',
            'https://www.douyin.com/user/1234567890123456789',
            f'https://example.com/video/{VIDEO_ID}',
        ):
            self.assertIsNone(DouyinParser.extract_video_reference(url))

    def test_router_data_handles_braces_quotes_and_spacing(self):
        html = share_html(video_item()).replace(' = ', '=\n')
        data = json.loads(DouyinParser.extract_router_data(html))
        item = data['loaderData']['video_(id)/page']['videoInfoRes']['item_list'][0]
        self.assertEqual(item['desc'], video_item()['desc'])


class ParseTests(unittest.IsolatedAsyncioTestCase):
    async def test_short_link_uses_get_and_stops_at_work_url(self):
        parser = DouyinParser()
        session = Session([
            Response(status=302, headers={'Location': SHARE_URL + '?from=6383'}),
            Response(share_html(video_item())),
        ])
        result = await parser.parse_single_url(session, SHORT_URL)
        self.assertEqual(result['video_id'], VIDEO_ID)
        self.assertEqual([url for url, _ in session.requests], [SHORT_URL, SHARE_URL])
        self.assertFalse(session.requests[0][1]['allow_redirects'])
        self.assertEqual(
            result['video_url'],
            'https://aweme.snssdk.com/aweme/v1/play/?video_id=test',
        )

    async def test_gallery_without_video_or_play_address(self):
        item = {
            'desc': '图集', 'images': [
                {'url_list': []}, {'url_list': ['https://example.com/image.jpg']},
            ],
        }
        session = Session([Response(share_html(item, 'note'))])
        result = await DouyinParser().parse_single_url(
            session, f'https://www.douyin.com/note/{VIDEO_ID}',
        )
        self.assertTrue(result['is_gallery'])
        self.assertEqual(result['images'], ['https://example.com/image.jpg'])
        self.assertEqual(result['thumb_url'], result['images'][0])
        self.assertIsNone(result['video_url'])
        self.assertIn(f'/share/note/{VIDEO_ID}/', session.requests[0][0])

    async def test_uri_fallback_and_empty_cover(self):
        item = video_item()
        item['video'] = {'play_addr': {'uri': 'video-token'}, 'cover': {'url_list': []}}
        result = await DouyinParser().fetch_video_info(
            Session([Response(share_html(item))]), VIDEO_ID,
        )
        self.assertIn('video_id=video-token', result['video_url'])
        self.assertIsNone(result['thumb_url'])

    async def test_static_gallery_music_is_not_a_video(self):
        music_url = 'https://example.com/music.mp3?token=test'
        item = video_item()
        item['images'] = [{'url_list': ['https://example.com/original.jpg']}]
        item['video']['play_addr'] = {
            'uri': music_url,
            'url_list': [f'https://aweme.snssdk.com/aweme/v1/playwm/?video_id={music_url}'],
        }
        result, _ = await self.run_cli(SHARE_URL, Session([Response(share_html(item))]))
        parsed = result['data'][0]
        self.assertTrue(parsed['is_gallery'])
        self.assertEqual(parsed['images'], ['https://example.com/original.jpg'])
        self.assertIsNone(parsed['video_url'])
        self.assertEqual(parsed['audio_url'], music_url)

    async def test_direct_music_url_is_not_a_video(self):
        item = video_item()
        item['images'] = [{'url_list': ['https://example.com/original.jpg']}]
        item['video']['play_addr'] = {'url_list': ['https://example.com/music.mp3']}
        result = await DouyinParser().fetch_video_info(
            Session([Response(share_html(item))]), VIDEO_ID,
        )
        self.assertIsNone(result['video_url'])
        self.assertEqual(result['audio_url'], 'https://example.com/music.mp3')

    async def run_cli(self, text, session):
        stdout, stderr = io.StringIO(), io.StringIO()
        with (
            patch('sys.argv', ['douyin_parser_standalone.py', text]),
            patch.object(DouyinParser, 'ensure_ttwid', new_callable=AsyncMock),
            patch('utils.douyin_parser_standalone.aiohttp.ClientSession', return_value=session),
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            await main()
        # json.loads 必须能直接读取整个 stdout，不能只解析最后一行。
        return json.loads(stdout.getvalue()), stderr.getvalue()

    async def test_missing_video_info_returns_json_without_stdout_logs(self):
        result, stderr = await self.run_cli(SHARE_URL, Session([Response(share_html())]))
        self.assertFalse(result['success'])
        self.assertIn('作品信息', result['error'])
        self.assertNotIn('未找到有效的抖音链接', result['error'])
        self.assertIn('抖音解析失败', stderr)

    async def test_success_contract_for_node(self):
        result, stderr = await self.run_cli(
            SHARE_URL, Session([Response(share_html(video_item()))]),
        )
        self.assertTrue(result['success'])
        self.assertEqual(result['count'], 1)
        self.assertEqual(result['data'][0]['author'], '测试作者')
        self.assertEqual(result['data'][0]['video_id'], VIDEO_ID)
        self.assertEqual(stderr, '')

    async def test_invalid_text_has_distinct_error(self):
        result, _ = await self.run_cli('这里没有链接', Session([]))
        self.assertEqual(result, {'success': False, 'error': '未找到有效的抖音链接'})

    async def test_http_error_returns_structured_failure(self):
        result, _ = await self.run_cli(SHARE_URL, Session([Response(status=403)]))
        self.assertFalse(result['success'])
        self.assertIn('HTTP 403', result['error'])

    async def test_one_failed_link_does_not_discard_successful_links(self):
        session = Session([Response(share_html()), Response(share_html(video_item()))])
        result, _ = await self.run_cli(
            SHARE_URL + f' https://www.douyin.com/video/{int(VIDEO_ID) + 1}',
            session,
        )
        self.assertTrue(result['success'])
        self.assertEqual(result['count'], 1)

    async def test_timeout_returns_json(self):
        stdout = io.StringIO()
        with (
            patch('sys.argv', ['parser.py', SHORT_URL]),
            patch.object(DouyinParser, 'parse_text', side_effect=asyncio.TimeoutError),
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(io.StringIO()),
        ):
            await main()
        result = json.loads(stdout.getvalue())
        self.assertFalse(result['success'])
        self.assertIn('超时', result['error'])


class CookieTests(unittest.IsolatedAsyncioTestCase):
    async def test_registration_callback_sets_share_cookie_and_is_reused(self):
        calls = []
        parser = DouyinParser()

        async def register(request):
            calls.append('register')
            payload = await request.json()
            self.assertEqual(payload['service'], 'www.iesdouyin.com')
            self.assertTrue(payload['union'])
            return web.json_response({'redirect_url': parser.SHARE_ORIGIN + 'callback'})

        async def callback(request):
            calls.append('callback')
            response = web.Response()
            response.set_cookie('ttwid', 'anonymous-test-cookie')
            return response

        app = web.Application()
        app.router.add_post('/register', register)
        app.router.add_get('/callback', callback)
        runner = web.AppRunner(app)
        await runner.setup()
        try:
            site = web.TCPSite(runner, '127.0.0.1', 0)
            await site.start()
            port = runner.addresses[0][1]
            parser.SHARE_ORIGIN = f'http://127.0.0.1:{port}/'
            parser.TTWID_REGISTER_URL = parser.SHARE_ORIGIN + 'register'
            # 测试服务使用 IP，生产代码仍使用 aiohttp 默认的域名 Cookie 限制。
            async with aiohttp.ClientSession(cookie_jar=aiohttp.CookieJar(unsafe=True)) as session:
                await parser.ensure_ttwid(session)
                await parser.ensure_ttwid(session)
            self.assertEqual(calls, ['register', 'callback'])
        finally:
            await runner.cleanup()


if __name__ == '__main__':
    unittest.main()
