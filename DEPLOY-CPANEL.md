# استقرار روی سی‌پنل و رفع ۴۰۳

سایت استاتیک است و هیچ نیازی به PHP، دیتابیس یا Node روی هاست ندارد. فقط
فایل‌ها باید در جای درست و با دسترسی درست بنشینند.

## چه چیزی آپلود شود

همه‌چیز به‌جز این‌ها:

```
.git/            تاریخچهٔ گیت
node_modules/    اگر وجود دارد
scripts/         ابزار build و audit — سایت به آن‌ها نیاز ندارد
```

`scripts/` و پوشه‌های `_source/` اگر هم آپلود شوند، `.htaccess` دسترسی وب به
آن‌ها را می‌بندد. ولی آپلود نکردنشان ساده‌تر است.

ساختار درست در `public_html`:

```
public_html/
    index.html          ← نه public_html/carbonix/index.html
    .htaccess
    404.html
    robots.txt
    sitemap.xml
    fa/  en/  ar/
    assets/
```

---

# ۴۰۳ Forbidden

## علت قطعی‌شده در این پروژه: بیت‌های دسترسی

لاگ خطا این را گفت:

```
Permission of file [/home3/.../public_html/index.html] does not meet the
requirements of 'Required bits' or 'Restricted bits', access denied.
```

این پیام **مخصوص LiteSpeed** است و دربارهٔ بیت‌های دسترسی فایل است، نه
دربارهٔ `.htaccess`. برخلاف Apache که فقط می‌پرسد «خواندنی هست یا نه؟»،
LiteSpeed دو شرط دارد:

- **Required bits** — بیت‌هایی که *باید* ست باشند
- **Restricted bits** — بیت‌هایی که *نباید* ست باشند

روی بیشتر سی‌پنل‌ها Restricted bits شامل **نوشتنی‌بودن برای گروه یا همه**
است. یعنی `664` و `666` و `775` و `777` همه رد می‌شوند — حتی اگر فایل
کاملاً خواندنی باشد. به همین دلیل ممکن است در File Manager نگاه کنید و
دسترسی‌ها «درست» به‌نظر برسند، ولی سرور بازشان کند.

مقدار درست، و تنها مقدار درست:

| | مقدار |
|---|---|
| پوشه‌ها | `755` |
| فایل‌ها | `644` |

**`777` را امتحان نکنید.** رایج‌ترین اشتباه در همین وضعیت است. LiteSpeed
آن را هم رد می‌کند، چون world-writable دقیقاً همان چیزی است که Restricted
bits جلویش را می‌گیرد.

### اصلاح در File Manager سی‌پنل — دو پاس

باید دو بار انجام شود، چون پوشه و فایل مقدار متفاوتی می‌گیرند.

پاس اول، پوشه‌ها:

1. وارد `public_html` شوید
2. **Select All**
3. دکمهٔ **Permissions**
4. مقدار را `0755` بگذارید
5. تیک **Recurse into subdirectories**
6. گزینهٔ **Apply to directories only**
7. **Change Permissions**

پاس دوم، فایل‌ها:

1. باز **Select All**
2. **Permissions**
3. مقدار `0644`
4. تیک **Recurse into subdirectories**
5. گزینهٔ **Apply to files only**
6. **Change Permissions**

خودِ `public_html` هم باید `755` باشد: یک سطح بالاتر بروید، رویش راست‌کلیک
و Change Permissions.

### یا در Terminal اگر هاست فعالش کرده

```bash
cd ~/public_html
find . -type d -exec chmod 755 {} +
find . -type f -exec chmod 644 {} +
chmod 755 ~/public_html
```

### اگر با ۶۴۴/۷۵۵ هم ادامه داشت

دو احتمال می‌ماند و هر دو به پشتیبانی هاست نیاز دارد:

1. **مالکیت فایل‌ها.** در File Manager ستون Owner باید یوزر سی‌پنل شما باشد،
   نه `root` و نه `nobody`. اگر غلط است از پنل قابل اصلاح نیست — فایل‌ها را
   پاک کنید و از داخل خود File Manager دوباره آپلود کنید، یا از پشتیبانی
   `chown` بخواهید.
2. **سیاست خود سرور.** از پشتیبانی بخواهید در LiteSpeed WebAdmin مسیر
   **Server → Security → File Access** را برای اکانت شما ببینند. آن تنظیم
   فقط با WHM/root قابل تغییر است.

---

# سایر علت‌های ۴۰۳ — اگر لاگ چیز دیگری گفت

متن «Access to this resource on the server is denied!» صفحهٔ پیش‌فرض
LiteSpeed است.

فایل `.htaccess` این پروژه هیچ قانون منع‌کننده‌ای برای صفحات سایت ندارد —
نه `Deny`، نه `Require all denied` روی محتوا، نه `Options -Indexes`. پس ۴۰۳
از حساب هاست می‌آید، نه از این فایل.

## ۱. لاگ خطا — علت را با اسم می‌گوید

سی‌پنل ← **Metrics** ← **Errors**، یا فایل `~/logs/error_log` در File
Manager. اگر این را دارید، بقیهٔ مراحل لازم نیست.

| در لاگ | یعنی |
|---|---|
| `does not meet the requirements of 'Required bits'` | بیت‌های دسترسی — بخش بالا |
| `Auto Index is disabled for [...]` | `index.html` در آن مسیر نیست — مرحلهٔ ۲ |
| `client denied by server configuration` | مالکیت فایل — مرحلهٔ ۳ |
| `ModSecurity: Access denied` | مرحلهٔ ۵ |
| `<directive> not allowed here` | مرحلهٔ ۴ |

خط `File not found [403.shtml]` که زیر هر رد شدن می‌آید خطا نیست: LiteSpeed
دارد صفحهٔ ۴۰۳ پیش‌فرض خودش را می‌جوید. `.htaccess` الان `ErrorDocument 403`
دارد، پس دیگر نباید ظاهر شود.

## ۲. جای آپلود و ریشهٔ داکیومنت

محتوا داخل زیرپوشه باشد ولی `public_html` خودش `index.html` نداشته باشد →
listing خاموش است → **۴۰۳، نه ۴۰۴**.

- ببینید `index.html` مستقیماً داخل `public_html` هست یا داخل پوشهٔ دیگری
- اگر دامنهٔ فرعی یا Addon Domain است: سی‌پنل ← **Domains** ← ستون Document
  Root را ببینید

تست ۳۰ ثانیه‌ای: در `public_html` پوشهٔ `test` بسازید، داخلش `index.html` با
محتوای `ok`، و `دامنه.com/test/` را باز کنید.

- `ok` دیدید → ریشه سالم است، برو مرحلهٔ ۴
- باز ۴۰۳ → مشکل حساب یا ریشهٔ داکیومنت است، برو مرحلهٔ ۳

## ۳. مالکیت فایل‌ها

ستون Owner در File Manager باید یوزر سی‌پنل شما باشد.

## ۴. آیا `.htaccess` مقصر است — تست قطعی

`.htaccess` را به `htaccess.bak` تغییر نام دهید و سایت را باز کنید.

| نتیجه | معنی |
|---|---|
| باز ۴۰۳ | `.htaccess` بی‌گناه است، برگردانیدش |
| سایت آمد | یک directive را هاست اجازه نمی‌دهد |

در حالت دوم: محتوای `scripts/htaccess-minimal.txt` را به‌عنوان `.htaccess`
بگذارید. آن نسخه فقط چیزهای ضروری را دارد و هیچ قانون منع‌کننده‌ای ندارد.
اگر با آن کار کرد، بلوک‌های `Header` و `Expires` و `Deflate` و `Rewrite` را
یکی‌یکی از فایل اصلی برگردانید تا مقصر پیدا شود.

## ۵. ModSecurity و ابزارهای مسدودکنندهٔ سی‌پنل

همه ۴۰۳ می‌دهند و هیچ‌کدام در `.htaccess` دیده نمی‌شوند:

| در سی‌پنل | چه می‌کند |
|---|---|
| **Security** ← ModSecurity | برای دامنه موقتاً خاموش کنید و تست |
| **Security** ← IP Blocker | IP خودتان بلاک نشده باشد |
| **Security** ← Hotlink Protection | اگر روشن است ۴۰۳ می‌دهد |
| **Security** ← Leech Protection | روی پوشهٔ سایت نباشد |

## دربارهٔ نویز لاگ

خطوطی مثل `wp-admin/install.php` و `server-status` و `/v2/_catalog` و
`.DS_Store` اسکن ربات‌های اینترنت است، نه مشکل سایت. سایت وردپرس نیست و
هیچ‌کدام از آن مسیرها وجود ندارد. طبیعی است و کاری لازم ندارد.

---

# بعد از اینکه سایت باز شد

`دامنه.com/check.html` را باز کنید. آن صفحه به CSS و JS سایت وابسته نیست، پس
حتی وقتی همه‌چیز خراب است هم رندر می‌شود و می‌گوید کدام فایل نرسیده و با چه
`Content-Type`.

دو چیز را مخصوصاً چک کنید، چون تازه روی سرور واقعی اجرا می‌شوند:

1. **`Content-Type` تصاویر** — `.avif` باید `image/avif` باشد نه
   `application/octet-stream`. اگر نبود، بلوک `mod_mime` اجرا نشده.
2. **ریدایرکت‌ها** — `دامنه.com/fa/systems/` باید به `/fa/products/` برود، و
   `/fa/products/cold-brew-kettles/` هم به `/fa/products/`.
