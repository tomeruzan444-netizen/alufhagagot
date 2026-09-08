<?php
/**
 * Lead form handler for אלוף הגגות.
 *
 * Receives the site's contact forms and emails them. No third-party service,
 * no account, no send quota - Hostinger runs PHP natively.
 *
 * Returns JSON so the front-end can keep the visitor on the page.
 */

declare(strict_types=1);

// ---------------------------------------------------------------- settings
const MAIL_TO      = 'Menahemtoledo4@gmail.com';
const MAIL_FROM    = 'no-reply@roofschamp.co.il';   // must be on this domain for SPF
const SITE_NAME    = 'אלוף הגגות';
const RATE_LIMIT   = 6;        // submissions ...
const RATE_WINDOW  = 600;      // ... per this many seconds, per IP
const MIN_FILL_SEC = 3;        // a human takes at least this long to fill the form

header('Content-Type: application/json; charset=utf-8');

function reply(bool $ok, string $message = '', int $code = 200): never {
    http_response_code($code);
    echo json_encode(['success' => $ok, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

/** Strips CR/LF so a submitted value can never inject extra mail headers. */
function headerSafe(string $v): string {
    return trim(str_replace(["\r", "\n", "%0a", "%0d"], ' ', $v));
}

function clientIp(): string {
    foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $k) {
        if (!empty($_SERVER[$k])) {
            $ip = explode(',', (string) $_SERVER[$k])[0];
            return trim($ip);
        }
    }
    return 'unknown';
}

// ------------------------------------------------------------------ guards
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    reply(false, 'Method not allowed', 405);
}

// Honeypot: a real visitor never sees this field, bots fill it in.
if (!empty($_POST['botcheck'])) {
    reply(true);   // pretend it worked so the bot does not retry
}

// Timing: a form submitted within a few seconds of loading is automation.
$rendered = isset($_POST['t']) ? (int) $_POST['t'] : 0;
if ($rendered > 0 && (time() - $rendered) < MIN_FILL_SEC) {
    reply(true);
}

// Rate limit per IP, kept in the system temp dir.
$ipHash = substr(hash('sha256', clientIp()), 0, 24);
$bucket = sys_get_temp_dir() . '/rc-lead-' . $ipHash;
$hits   = [];
if (is_readable($bucket)) {
    $hits = array_filter(
        (array) json_decode((string) file_get_contents($bucket), true),
        static fn($t) => is_int($t) && $t > time() - RATE_WINDOW
    );
}
if (count($hits) >= RATE_LIMIT) {
    reply(false, 'יותר מדי פניות. אנא נסו שוב בעוד כמה דקות או התקשרו אלינו.', 429);
}

// ------------------------------------------------------------------ fields
$skip = ['botcheck', 'subject', 'from_page', 't'];
$fields = [];
foreach ($_POST as $key => $value) {
    if (in_array($key, $skip, true) || !is_string($value)) continue;
    $value = trim($value);
    if ($value === '') continue;
    $fields[substr(strip_tags($key), 0, 60)] = substr(strip_tags($value), 0, 2000);
}

if (!$fields) {
    reply(false, 'הטופס ריק.', 422);
}

// Require something that looks like an Israeli phone number - that is the one
// detail a lead is useless without.
$hasPhone = false;
foreach ($fields as $v) {
    if (preg_match('/0\d{1,2}[-\s]?\d{7}|(\+?972)\d{8,9}/', str_replace(' ', '', $v))) {
        $hasPhone = true;
        break;
    }
}
if (!$hasPhone) {
    reply(false, 'נא להזין מספר טלפון תקין.', 422);
}

// ------------------------------------------------------------------- email
$page    = headerSafe(substr((string) ($_POST['from_page'] ?? ''), 0, 200));
$subject = headerSafe(substr((string) ($_POST['subject'] ?? ('פנייה חדשה מהאתר - ' . SITE_NAME)), 0, 160));

$lines = ['פנייה חדשה מאתר ' . SITE_NAME, str_repeat('=', 34), ''];
foreach ($fields as $k => $v) {
    $lines[] = $k . ': ' . $v;
}
$lines[] = '';
$lines[] = str_repeat('-', 34);
if ($page !== '') $lines[] = 'עמוד המקור: https://roofschamp.co.il' . $page;
$lines[] = 'זמן: ' . date('d/m/Y H:i');
$lines[] = 'IP: ' . clientIp();

$body = implode("\n", $lines);

$headers = [
    'From: =?UTF-8?B?' . base64_encode(SITE_NAME) . '?= <' . MAIL_FROM . '>',
    'Reply-To: ' . MAIL_FROM,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'X-Mailer: roofschamp-static',
];

$encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
$sent = @mail(MAIL_TO, $encodedSubject, $body, implode("\r\n", $headers), '-f' . MAIL_FROM);

if (!$sent) {
    error_log('roofschamp lead form: mail() failed for ' . $page);
    reply(false, 'השליחה נכשלה. אנא התקשרו אלינו: 050-565-0223', 500);
}

// record the successful submission against the rate limit
$hits[] = time();
@file_put_contents($bucket, json_encode(array_values($hits)), LOCK_EX);

reply(true, 'תודה! קיבלנו את הפנייה ונחזור אליכם בהקדם.');
