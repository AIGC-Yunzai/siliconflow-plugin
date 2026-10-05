import test from 'node:test';
import assert from 'node:assert/strict';
import { sendDouyinGallery } from '../utils/douyinGallery.js';

const item = count => ({
    images: Array.from({ length: count }, (_, n) => `https://example.com/body-${n}.jpeg`),
    cover_url: 'https://example.com/cover.webp',
});
const options = {
    makeImage: data => ({ type: 'image', data }),
    makeForwardMsg: async (e, nodes) => ({ type: 'forward', nodes }),
    fetchImpl: async url => ({
        ok: true, headers: new Headers({ 'content-type': 'image/jpeg' }),
        arrayBuffer: async () => Buffer.from(url),
    }),
};

test('single gallery sends downloaded body image, never cover', async () => {
    const replies = [];
    const input = item(1);
    await sendDouyinGallery({ reply: async msg => replies.push(msg) }, input, '标题', {
        ...options,
        fetchImpl: async (url, request) => {
            assert.equal(url, input.images[0]);
            assert.equal(request.headers.Referer, 'https://www.iesdouyin.com/');
            return options.fetchImpl(url);
        },
    });
    assert.equal(replies.length, 1);
    assert.ok(Buffer.isBuffer(replies[0][0].data));
    assert.equal(replies[0][0].data.toString(), input.images[0]);
    assert.match(replies[0][1], /图数: 1张/);
});

test('failed forward falls back to batches without losing body images', async () => {
    const replies = [];
    await sendDouyinGallery({ reply: async msg => {
        if (msg.type === 'forward') return false;
        replies.push(msg);
    } }, item(5), '标题', options);
    const sent = replies.flat().filter(x => x.type === 'image');
    assert.equal(sent.length, 5);
    assert.deepEqual(sent.map(x => x.data.toString()), item(5).images);
});

test('download failure is reported and remaining pictures still send', async () => {
    const replies = [];
    await sendDouyinGallery({ reply: async msg => replies.push(msg) }, item(2), '标题', {
        ...options,
        fetchImpl: async url => url.includes('body-0')
            ? { ok: false, status: 403 } : options.fetchImpl(url),
    });
    assert.equal(replies[0][0].data.toString(), item(2).images[1]);
    assert.match(replies[1], /第1张图片下载失败：HTTP 403/);
});

test('adapter rejection is reported with original image URL', async () => {
    const replies = [];
    await sendDouyinGallery({ reply: async msg => {
        replies.push(msg);
        return Array.isArray(msg) ? false : true;
    } }, item(1), '标题', options);
    assert.match(replies[1], /第1张图片发送失败/);
    assert.ok(replies[1].includes(item(1).images[0]));
});
