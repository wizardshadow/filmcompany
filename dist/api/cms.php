<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

const PASSWORD_SHA256 = 'b0618d320286762402e9da304a03b1cc054eda87217d256fa36cacfaf0853ceb';
const SESSION_TTL = 28800;

function respond(array $payload, int $status = 200, ?string $cookie = null): void {
    http_response_code($status);
    if ($cookie !== null) header('Set-Cookie: ' . $cookie, false);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function data_dir(): string {
    $dir = dirname(__DIR__, 2) . '/private/cms';
    if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) {
        respond(['error' => 'Не удалось выполнить запрос. Повторите попытку.'], 500);
    }
    return $dir;
}

function origin_ok(): bool {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') return true;
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $expected = ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? '');
    return $origin !== '' && hash_equals($expected, $origin);
}

function read_json_file(string $path): ?array {
    if (!is_file($path)) return null;
    $data = json_decode((string) file_get_contents($path), true);
    return is_array($data) ? $data : null;
}

function write_json_file(string $path, array $data): void {
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
        respond(['error' => 'Не удалось выполнить запрос. Повторите попытку.'], 500);
    }
    $tmp = $path . '.tmp';
    if (file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_UNICODE)) === false || !rename($tmp, $path)) {
        respond(['error' => 'Не удалось выполнить запрос. Повторите попытку.'], 500);
    }
}

function cookie_header(string $token, int $age): string {
    return 'cms_session=' . $token . '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' . $age;
}

function session_user(): ?array {
    $token = $_COOKIE['cms_session'] ?? '';
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) return null;
    $file = data_dir() . '/sessions/' . hash('sha256', $token) . '.json';
    $record = read_json_file($file);
    if (!$record || (int) ($record['expires'] ?? 0) < (int) round(microtime(true) * 1000)) return null;
    return ['token' => $token, 'csrf' => (string) $record['csrf'], 'file' => $file];
}

function fields(): array {
    return read_json_file(__DIR__ . '/fields.json') ?? [];
}

function content_file(): string {
    return data_dir() . '/published.json';
}

function valid_value(string $id, mixed $value, array $fields): bool {
    $field = $fields[$id] ?? null;
    if (!is_array($field) || !is_string($value) || strlen($value) > 10000) return false;
    if (($field['type'] ?? '') === 'text') return true;
    if (str_starts_with($value, '/media/') || str_starts_with($value, 'assets/')) return !str_contains($value, '..');
    return (bool) preg_match('#^https://#', $value);
}

function public_index(): string {
    return dirname(__DIR__) . '/index.html';
}

function template_html(): string {
    $path = data_dir() . '/index.template.html';
    if (!is_file($path)) {
        $current = file_get_contents(public_index());
        if ($current === false || $current === '') respond(['error' => 'Не удалось прочитать страницу сайта'], 500);
        if (file_put_contents($path, $current) === false) respond(['error' => 'Не удалось выполнить запрос. Повторите попытку.'], 500);
    }
    $html = file_get_contents($path);
    if ($html === false || $html === '') respond(['error' => 'Не удалось прочитать страницу сайта'], 500);
    return $html;
}

function apply_field(string $html, string $id, array $field, string $value): string {
    $count = 0;
    $quotedId = preg_quote($id, '/');
    if (($field['type'] ?? '') === 'text') {
        $safe = htmlspecialchars($value, ENT_NOQUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $updated = preg_replace_callback(
            '/(<cms-text\b[^>]*\bdata-cms="' . $quotedId . '"[^>]*>)(.*?)(<\/cms-text>)/s',
            static function (array $match) use ($safe): string {
                return $match[1] . $safe . $match[3];
            },
            $html,
            1,
            $count
        );
    } else {
        $attribute = (string) ($field['attribute'] ?? 'src');
        if (!preg_match('/^[A-Za-z_:][A-Za-z0-9_:.-]*$/', $attribute)) {
            respond(['error' => 'Не найдено поле на странице'], 500);
        }
        $safe = htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $updated = preg_replace_callback(
            '/<[^>]*\bdata-cms="' . $quotedId . '"[^>]*>/',
            static function (array $match) use ($attribute, $safe): string {
                $tag = $match[0];
                $attrCount = 0;
                $replaced = preg_replace(
                    '/(?<![\w-])' . preg_quote($attribute, '/') . '="[^"]*"/',
                    $attribute . '="' . $safe . '"',
                    $tag,
                    1,
                    $attrCount
                );
                if ($attrCount === 1 && is_string($replaced)) return $replaced;
                return substr($tag, 0, -1) . ' ' . $attribute . '="' . $safe . '">';
            },
            $html,
            1,
            $count
        );
    }
    if (!is_string($updated) || $count !== 1) respond(['error' => 'Не найдено поле на странице'], 500);
    return $updated;
}

function publish_html(array $values, array $fields): void {
    $html = template_html();
    foreach ($values as $id => $value) {
        if (!is_string($id) || !isset($fields[$id]) || !is_string($value)) continue;
        $html = apply_field($html, $id, $fields[$id], $value);
    }
    $target = public_index();
    $tmp = $target . '.cms.tmp';
    if (file_put_contents($tmp, $html) === false || !rename($tmp, $target)) {
        if (is_file($tmp)) unlink($tmp);
        respond(['error' => 'Не удалось записать страницу сайта'], 500);
    }
}

$path = (string) ($_GET['path'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!origin_ok()) respond(['error' => 'Недопустимый источник запроса'], 403);

if ($path === 'login' && $method === 'POST') {
    $dir = data_dir();
    $attemptFile = $dir . '/attempts/' . hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown') . '.json';
    $attempts = read_json_file($attemptFile) ?? ['count' => 0, 'expires' => 0];
    $now = (int) round(microtime(true) * 1000);
    if ((int) ($attempts['expires'] ?? 0) < $now) $attempts = ['count' => 0, 'expires' => $now + 900000];
    if ((int) ($attempts['count'] ?? 0) >= 10) {
        respond(['error' => 'Слишком много попыток. Повторите через 15 минут.'], 429);
    }
    $body = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($body)) $body = [];
    $supplied = hash('sha256', (string) ($body['password'] ?? ''));
    if (($body['username'] ?? '') !== 'admin' || !hash_equals(PASSWORD_SHA256, $supplied)) {
        $attempts['count'] = (int) ($attempts['count'] ?? 0) + 1;
        write_json_file($attemptFile, $attempts);
        respond(['error' => 'Неверный логин или пароль'], 401);
    }
    if (is_file($attemptFile)) unlink($attemptFile);
    $token = bin2hex(random_bytes(32));
    $csrf = bin2hex(random_bytes(16));
    write_json_file($dir . '/sessions/' . hash('sha256', $token) . '.json', [
        'csrf' => $csrf,
        'expires' => $now + SESSION_TTL * 1000,
    ]);
    respond(['csrf' => $csrf], 200, cookie_header($token, SESSION_TTL));
}

$user = session_user();
if (!$user) respond(['error' => 'Войдите в админку'], 401);
if ($method !== 'GET' && !hash_equals($user['csrf'], (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) {
    respond(['error' => 'Обновите страницу и повторите вход'], 403);
}
if ($path === 'session' && $method === 'GET') respond(['csrf' => $user['csrf']]);
if ($path === 'logout' && $method === 'POST') {
    if (is_file($user['file'])) unlink($user['file']);
    respond(['ok' => true], 200, cookie_header('', 0));
}
if ($path === 'content' && $method === 'GET') {
    $record = read_json_file(content_file());
    respond([
        'values' => is_array($record['values'] ?? null) ? $record['values'] : [],
        'revision' => $record['revision'] ?? null,
        'fields' => fields(),
    ]);
}
if ($path === 'content' && ($method === 'PUT' || $method === 'POST')) {
    $raw = (string) file_get_contents('php://input');
    if (strlen($raw) > 1000000) respond(['error' => 'Слишком большой запрос'], 413);
    $body = json_decode($raw, true);
    $values = is_array($body) ? ($body['values'] ?? null) : null;
    $known = fields();
    if (!is_array($values) || (array_is_list($values) && count($values) > 0)) {
        respond(['error' => 'Проверьте значения полей'], 400);
    }
    if (array_is_list($values)) $values = [];
    foreach ($values as $id => $value) {
        if (!is_string($id) || !valid_value($id, $value, $known)) respond(['error' => 'Проверьте значения полей'], 400);
    }
    $current = read_json_file(content_file());
    $revision = is_array($body) ? ($body['revision'] ?? null) : null;
    if ($revision) {
        if (!$current || ($current['revision'] ?? null) !== $revision) {
            respond(['error' => 'Контент уже изменён в другой вкладке. Обновите редактор перед сохранением.'], 409);
        }
    } elseif ($current) {
        respond(['error' => 'Контент уже изменён в другой вкладке. Обновите редактор перед сохранением.'], 409);
    }
    publish_html($values, $known);
    $etag = bin2hex(random_bytes(16));
    write_json_file(content_file(), ['values' => $values, 'revision' => $etag]);
    respond(['revision' => $etag]);
}
if ($path === 'upload' && $method === 'POST') {
    $type = strtolower(trim(explode(';', (string) ($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
    $extensions = [
        'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp',
        'image/gif' => 'gif', 'video/mp4' => 'mp4', 'video/webm' => 'webm',
    ];
    if (!isset($extensions[$type])) respond(['error' => 'Поддерживаются JPG, PNG, WebP, GIF, MP4 и WebM'], 400);
    $data = (string) file_get_contents('php://input');
    if (strlen($data) > 20 * 1024 * 1024) respond(['error' => 'Максимальный размер файла — 20 МБ'], 413);
    $name = bin2hex(random_bytes(16)) . '.' . $extensions[$type];
    $directory = dirname(__DIR__) . '/media';
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
        respond(['error' => 'Не удалось выполнить запрос. Повторите попытку.'], 500);
    }
    if (file_put_contents($directory . '/' . $name, $data) === false) {
        respond(['error' => 'Не удалось выполнить запрос. Повторите попытку.'], 500);
    }
    respond(['url' => '/media/' . $name]);
}
respond(['error' => 'Маршрут не найден'], 404);
