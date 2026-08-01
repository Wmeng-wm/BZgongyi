# 构建脚本：把 index.html 内嵌到 worker.js
# 用法: python build.py
import os, json

base = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(base, 'index.html'), 'r', encoding='utf-8') as f:
    html = f.read()

# JSON.stringify 转义，安全嵌入 JS 字符串
html_escaped = json.dumps(html, ensure_ascii=False)

worker = f'''// BZgongyi 医疗编织工艺计算平台 - 静态站点 Worker (自动生成，勿手改)
// 重新生成: cd D:\\项目\\BZgongyi && python build.py
// 部署: unset HTTP_PROXY HTTPS_PROXY && npx wrangler deploy
const HTML = {html_escaped};

export default {{
  async fetch(request) {{
    const url = new URL(request.url);
    if (url.pathname !== '/' && url.pathname !== '/index.html') {{
      return new Response('Not Found', {{ status: 404 }});
    }}
    return new Response(HTML, {{
      headers: {{
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600'
      }}
    }});
  }}
}};
'''

with open(os.path.join(base, 'src', 'worker.js'), 'w', encoding='utf-8') as f:
    f.write(worker)

print(f"OK - worker.js generated ({len(html)//1024} KB HTML embedded)")
