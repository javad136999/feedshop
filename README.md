# داشبورد حسابداری مغازه خوراک دام و طیور

سایت استاتیک (بدون build) + Supabase + Vercel. آفلاین‌محور (PWA): بدون اینترنت هم فروش ثبت می‌شود و با وصل شدن اینترنت همگام می‌شود.

## راه‌اندازی (۵ مرحله)
1. **Supabase**: پروژه جدید بسازید → SQL Editor → محتوای `supabase/schema.sql` و بعد `supabase/seed.sql` را اجرا کنید.
2. **کاربران**: Authentication → Users → Add user (تیک *Auto Confirm User*):
   `admin@shop.local` ، `coworker1@shop.local` ، `coworker2@shop.local` با رمزهای دلخواه.
   (در صفحه ورود فقط `admin` / `coworker1` / `coworker2` تایپ می‌شود. admin خودکار مدیر می‌شود، بقیه فقط مشاهده.)
   اگر رمز کوتاه می‌خواهید: Authentication → Sign In / Providers → Email → Minimum password length را کم کنید. رمز قوی توصیه می‌شود.
3. **config.js**: آدرس پروژه و anon key (Settings → API) و نام/تلفن مغازه را بنویسید.
4. **GitHub → Vercel**: پوشه را در یک ریپو بگذارید → در Vercel با Import همان ریپو (Framework: Other، بدون build) دیپلوی کنید.
5. **بکاپ هر ۳ روز**: در GitHub → Settings → Secrets → Actions این چهار مقدار را بسازید:
   `SUPABASE_URL` ، `SUPABASE_SERVICE_KEY` (service_role؛ مخفی بماند) ، `GMAIL_USER` ، `GMAIL_APP_PASSWORD`
   (رمز برنامه گوگل، از Google Account → Security → App passwords). فایل اکسل به petor9005@gmail.com ارسال می‌شود.
   تست فوری: تب Actions → backup-every-3-days → Run workflow.

## فاکتور PDF
در تب فروش، دکمه «PDF» فاکتور A4 را باز می‌کند → در پنجره چاپ «Save as PDF» را بزنید.

## نکات
- موجودی = موجودی اولیه + خریدها − فروش‌ها (برگشت کالا: فروش با تعداد منفی ثبت کنید).
- قیمت‌ها و تعداد باید با واحد کالا (مثلاً «کیسه») یکی باشند.
