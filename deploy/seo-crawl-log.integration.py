"""Real isolated Caddy integration; uses the supplied, already available image.

Run with a Docker-capable local test host:
  python3 deploy/seo-crawl-log.integration.py --image caddy:2-alpine
No production mounts, secrets, hosts or requests are used.
"""
import argparse
import json
import pathlib
import subprocess
import tempfile
import time
import urllib.request
import uuid


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--image', required=True)
    args = parser.parse_args()
    caddyfile = pathlib.Path(__file__).with_name('Caddyfile').read_text()
    block = caddyfile.split('# BEGIN DEERE SEO CRAWL LOG\n', 1)[1].split('\t# END DEERE SEO CRAWL LOG', 1)[0]
    name = 'deere-seo-log-test-' + uuid.uuid4().hex[:10]

    def docker(*parts):
        return subprocess.check_output(['docker', *parts], stderr=subprocess.STDOUT, text=True).strip()

    with tempfile.TemporaryDirectory(prefix='deere-seo-log-') as tmp:
        root = pathlib.Path(tmp)
        (root / 'data').mkdir()

        def config(phase, logging):
            return ('{\n admin off\n}\nhttp://deere-shop.test:8080 {\n' + (block if logging else '') +
                    '\n header X-Test-Phase ' + phase + '\n respond "ok" 200\n}\n' +
                    'http://other.test:8080 {\n respond "other" 200\n}\n')

        (root / 'Caddyfile').write_text(config('before', False))
        started = False
        try:
            docker('run', '-d', '--name', name, '--pull', 'never',
                   '-p', '127.0.0.1::8080', '-v', f'{root}:/fixture',
                   '-v', f'{root / "data"}:/data', args.image,
                   'caddy', 'run', '--config', '/fixture/Caddyfile', '--adapter', 'caddyfile')
            started = True
            port = docker('port', name, '8080/tcp').rsplit(':', 1)[1]

            def request(path='/', agent='Mozilla/5.0', method='GET', host='deere-shop.test', sensitive=False):
                headers = {'Host': host, 'User-Agent': agent}
                if sensitive:
                    headers.update({'Authorization': 'Bearer SECRET_CANARY', 'Cookie': 'session=COOKIE_CANARY', 'Referer': 'https://private.test/?email=EMAIL_CANARY', 'X-Revalidate-Secret': 'HEADER_CANARY'})
                req = urllib.request.Request('http://127.0.0.1:' + port + path,
                                             headers=headers, method=method,
                                             data=b'BODY_CANARY' if method == 'POST' else None)
                with urllib.request.urlopen(req, timeout=4) as response:
                    return response.status, response.headers.get('X-Test-Phase')

            for _ in range(40):
                try:
                    if request()[1] == 'before':
                        break
                except (OSError, TimeoutError):
                    time.sleep(.1)
            else:
                raise AssertionError('Test Caddy did not start')
            container_before = docker('inspect', name, '--format', '{{.Id}} {{.State.StartedAt}}')
            (root / 'Caddyfile').write_text(config('after', True))
            docker('exec', name, 'caddy', 'validate', '--config', '/fixture/Caddyfile', '--adapter', 'caddyfile')
            # Same signal workflow as production with admin off; no restart.
            docker('kill', '--signal', 'USR1', name)
            for _ in range(40):
                if request()[1] == 'after':
                    break
                time.sleep(.1)
            else:
                raise AssertionError('Signal reload did not load candidate config')
            assert docker('inspect', name, '--format', '{{.Id}} {{.State.StartedAt}}') == container_before

            positive = [('/', 'YandexBot/3.0', 'GET'),
                        ('/catalog?email=QUERY_CANARY', 'Mozilla/5.0 (compatible; Googlebot/2.1)', 'GET'),
                        ('/catalog/parts/item?token=QUERY_CANARY', 'YandexBot/3.0', 'HEAD'),
                        ('/articles/selection', 'Googlebot/2.1', 'GET'),
                        ('/robots.txt', 'YandexBot/3.0', 'GET'),
                        ('/sitemap.xml', 'Googlebot/2.1', 'GET')]
            for path, agent, method in positive:
                assert request(path, agent, method, sensitive=True)[0] == 200
            negative = [('/', 'Mozilla/5.0', 'GET', 'deere-shop.test'),
                        ('/api/leads?secret=QUERY_CANARY', 'Googlebot', 'GET', 'deere-shop.test'),
                        ('/api/preview?token=QUERY_CANARY', 'YandexBot', 'GET', 'deere-shop.test'),
                        ('/abcdefgh12345678.txt', 'YandexBot', 'GET', 'deere-shop.test'),
                        ('/media/file', 'YandexBot', 'GET', 'deere-shop.test'),
                        ('/catalog', 'YandexBot', 'POST', 'deere-shop.test'),
                        ('/catalog', 'Googlebot', 'GET', 'other.test')]
            for path, agent, method, host in negative:
                assert request(path, agent, method, host, sensitive=True)[0] == 200
            logfile = root / 'data' / 'deere-seo-access.log'
            for _ in range(40):
                text = logfile.read_text() if logfile.exists() else ''
                if len(text.splitlines()) >= len(positive):
                    break
                time.sleep(.1)
            rows = [json.loads(line) for line in text.splitlines()]
            assert len(rows) == len(positive), 'Skipped requests leaked into access log'
            assert [row['request']['uri'] for row in rows] == [path.split('?')[0] for path, _, _ in positive]
            assert not any(word in text for word in ['CANARY', 'abcdefgh12345678', 'other.test', 'User-Agent', 'Authorization', 'Cookie', 'Referer'])
            for row in rows:
                assert row['status'] == 200 and row['duration'] >= 0
                assert row['request']['remote_ip']
                assert 'headers' not in row['request'] and 'tls' not in row['request']
                assert 'resp_headers' not in row and 'user_id' not in row
            assert logfile.stat().st_mode & 0o777 == 0o600
            print(json.dumps({'status': 'PASS', 'accepted_cases': len(positive), 'excluded_cases': len(negative),
                              'redaction': 'PASS', 'file_mode': '0600', 'admin_off_signal_reload': 'PASS',
                              'same_container_and_start_time': True, 'production_requests': 0}))
        finally:
            if started:
                docker('rm', '-f', name)


if __name__ == '__main__':
    main()
