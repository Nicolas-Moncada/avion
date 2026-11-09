import subprocess

out_html = subprocess.check_output(['git', 'show', 'antes-rediseno:templates/index.html'], encoding='utf-8')

# Search for payment methods in html
for term in ['cuotas', 'nequi', 'pse', 'pago-metodo', 'credit-card', 'boarding-pass-ticket', 'talon', 'troquel']:
    pos = 0
    while True:
        idx = out_html.lower().find(term, pos)
        if idx == -1:
            break
        print(f"=== FOUND {term} at {idx} in index.html ===")
        print(out_html[max(0, idx-200):idx+800])
        print("="*40)
        pos = idx + 1000
        if pos > len(out_html):
            break

# Also check static/js/app.js in antes-rediseno
try:
    out_js = subprocess.check_output(['git', 'show', 'antes-rediseno:static/js/app.js'], encoding='utf-8')
    for term in ['renderboardingpass', 'procesarpago', 'metodopago', 'nequi', 'pse']:
        idx = out_js.lower().find(term)
        if idx != -1:
            print(f"=== FOUND {term} at {idx} in app.js ===")
            print(out_js[max(0, idx-100):idx+1200])
            print("="*40)
except Exception as e:
    print("Error reading app.js:", e)
