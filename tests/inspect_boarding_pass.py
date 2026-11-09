import subprocess

out_js = subprocess.check_output(['git', 'show', 'antes-rediseno:static/js/app.js'], encoding='utf-8')
idx = out_js.find('ticket-right-stub')
if idx != -1:
    print(out_js[idx:idx+3500])
