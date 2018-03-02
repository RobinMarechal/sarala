import Post from './dummy/models/Post';
import Tag from './dummy/models/Tag';
import {
    Post as ApiPost,
    PostWithAllNesterRelations as ApiPostWithAllNesterRelations,
    Tag as ApiTag
} from './dummy/data/json-api-response';
import {config} from '../src/config';

config.base_url = 'test://un.it/api';

describe('api requests', () => {
    test('saving new object without an id should make a post request to resource endpoint', async () => {
        const post = new Post();
        post.title = 'Article evident arrived express highest men did boy.';
        post.subtitle = 'Mistress sensible entirely am so. Quick can manor smart money hopes worth too. Comfort produce husband boy her had hearing.';
        await post.save();

        expect(post.testApiRequest).toEqual({
            'data': {
                'data': {
                    'attributes': {
                        'title': 'Article evident arrived express highest men did boy.',
                        'subtitle': 'Mistress sensible entirely am so. Quick can manor smart money hopes worth too. Comfort produce husband boy her had hearing.',
                    },
                    'type': 'posts'
                }
            },
            'method': 'POST',
            'url': config.base_url + '/posts/'
        });
    });

    test('saving pre hydrated object with an id should make a put request to resource endpoint', async () => {
        const post = new Post();
        post.testApiResponse = ApiPost;

        let result = await post.find(1);

        result.title = 'Article evident arrived express highest men did boy.';
        result.subtitle = 'Mistress sensible entirely am so. Quick can manor smart money hopes worth too. Comfort produce husband boy her had hearing.';

        await result.save();

        expect(result.testApiRequest).toEqual({
            'data': {
                'data': {
                    'id': '1',
                    'type': 'posts',
                    'attributes': {
                        'slug': 'voluptates-laborum-non-voluptatem-ducimus-veniam-et',
                        'title': 'Article evident arrived express highest men did boy.',
                        'subtitle': 'Mistress sensible entirely am so. Quick can manor smart money hopes worth too. Comfort produce husband boy her had hearing.',
                        'body': 'Est quod itaque suscipit quidem dolor dolores velit. Nihil voluptas placeat ex consequatur quasi.\n\nEst nulla cupiditate ad beatae rerum veritatis vel. Quia ut doloribus consequatur porro. Eligendi sit et dignissimos qui voluptatem magnam mollitia labore.\n\nLibero saepe praesentium et sed. Exercitationem error rerum sit inventore provident laborum. Fuga pariatur dolor reiciendis. Quibusdam corrupti commodi ut quo non laboriosam quia. Nihil sit iste sit optio voluptas repellendus exercitationem.',
                        'published_at': '2018-01-25 00:00'
                    }
                }
            },
            'method': 'PUT',
            'url': config.base_url + '/posts/1'
        });
    });

    test('deleting pre hydrated object should make a delete request to resource endpoint', async () => {
        const post = new Post();
        post.testApiResponse = ApiPost;
        let result = await post.find(1);

        await result.delete();

        expect(result.testApiRequest).toEqual({
            'method': 'DELETE',
            'url': config.base_url + '/posts/1'
        });
    });

    test('attaching another object should make a post request to combined endpoint', async () => {
        const post = new Post();
        post.testApiResponse = ApiPost;
        let postResult = await post.find(1);

        const tag = new Tag();
        tag.testApiResponse = ApiTag;
        let tagResult = await tag.find(1);

        await postResult.attach(tagResult);

        expect(postResult.testApiRequest).toEqual({
            'method': 'POST',
            'url': config.base_url + '/posts/1/tags/5'
        });
    });

    test('attaching another object with pivot date should make a post request to combined endpoint with pivot data', async () => {
        const post = new Post();
        post.testApiResponse = ApiPost;
        let postResult = await post.find(1);

        const tag = new Tag();
        tag.testApiResponse = ApiTag;
        let tagResult = await tag.find(1);

        await postResult.attach(tagResult, { foo: 'bar', baz: 100 });

        expect(postResult.testApiRequest).toEqual({
            'data': { 'baz': 100, 'foo': 'bar' },
            'method': 'POST',
            'url': config.base_url + '/posts/1/tags/5'
        });
    });

    test('detaching another object should make a delete request to combined endpoint', async () => {
        const post = new Post();
        post.testApiResponse = ApiPost;
        let postResult = await post.find(1);

        const tag = new Tag();
        tag.testApiResponse = ApiTag;
        let tagResult = await tag.find(1);

        await postResult.detach(tagResult);

        expect(postResult.testApiRequest).toEqual({
            'method': 'DELETE',
            'url': config.base_url + '/posts/1/tags/5'
        });
    });

    test('sync relationship should make a put request to combined endpoint', async () => {
        const post = new Post();
        post.testApiResponse = ApiPostWithAllNesterRelations;
        let postResult = await post.find(1);

        await postResult.sync('tags');

        expect(postResult.testApiRequest).toEqual({
            'data': {
                'data': [
                    {
                        'id': '1',
                        'type': 'tags'
                    },
                    {
                        'id': '15',
                        'type': 'tags'
                    }
                ]
            },
            'method': 'PUT',
            'url': config.base_url + '/posts/1/tags'
        });
    });
});