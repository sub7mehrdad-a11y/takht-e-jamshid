# تخت جمشید — سایتِ ایستا (HTML/JS خالص). برای Liara (پلتفرم docker) یا هر PaaSِ دیگری.
# فقط فایل‌هایِ اجرایی داخلِ ایمیج می‌روند؛ تست‌ها، سندها و پروتوتایپ‌ها نه.
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html supabase-client.js resolveNight.js /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets

EXPOSE 80
