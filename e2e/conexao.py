"""O GerenciaAI não perde a conexão com o Vértice quando o armazenamento da janela some.

Mesma infraestrutura do run.py (scripts/e2e.mjs sobe emuladores e builds). Cada contexto do
navegador tem armazenamento próprio: é como abrir o GerenciaAI por outra origem (instalado x
código-fonte) ou depois de o armazenamento da janela ser apagado.
"""
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright, expect

PANEL, HARNESS = 'http://localhost:4300/', 'http://localhost:4302/'
CHROME = os.environ.get('CHROME')

def step(msg):
    print(f'✔ {msg}', flush=True)

async def estado(page):
    return await page.evaluate('window.vx && window.vx.getState()')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**({'executable_path': CHROME} if CHROME else {}), args=['--no-sandbox'])
        errors = []
        panel_ctx = await b.new_context(viewport={'width': 1440, 'height': 900})
        panel = await panel_ctx.new_page()
        panel.on('pageerror', lambda e: errors.append(f'painel: {e}'))
        await panel.goto(PANEL)
        await panel.get_by_role('tab', name='Criar conta').click()
        await panel.get_by_label('Seu nome').fill('Arthur Teste')
        await panel.get_by_label('Nome da empresa').fill('Padaria Conexão')
        await panel.get_by_label('E-mail').fill(f'conexao{int(time.time())}@teste.com')
        await panel.get_by_label('Senha').fill('segredo123')
        await panel.get_by_role('button', name='Criar conta').click()
        await expect(panel.get_by_text('Arthur.', exact=False).first).to_be_visible(timeout=15000)
        step('conta criada')

        # 1. Caixa conectado pelo código, como hoje.
        ctx_a = await b.new_context()
        pdv = await ctx_a.new_page()
        pdv.on('pageerror', lambda e: errors.append(f'caixa A: {e}'))
        await pdv.goto(HARNESS)
        await pdv.wait_for_function('window.vx && window.vx.getState().status === "unpaired"', timeout=20000)
        code = await pdv.evaluate('window.vx.startPairing()')
        await panel.goto(PANEL + '#/empresa?aba=integracoes')
        await panel.get_by_role('button', name='Conectar caixa').click()
        await panel.locator('#int-code').fill(code)
        await panel.get_by_role('dialog').get_by_role('button', name='Conectar').click()
        await pdv.wait_for_function('window.vx.getState().status === "paired" && window.conexao && window.conexao.dispositivo', timeout=20000)
        salva = await pdv.evaluate('window.conexao')
        assert salva['uid'] and json.loads(salva['sessao'])['stsTokenManager']['refreshToken'], salva
        step(f'caixa conectado; cópia da conexão guardada fora da janela (uid {salva["uid"][:6]}…)')

        # 2. Sem a cópia, uma janela com armazenamento novo pede código (era o defeito).
        ctx_c = await b.new_context()
        sem = await ctx_c.new_page()
        await sem.goto(HARNESS)
        await sem.wait_for_function('window.vx && window.vx.getState().status === "unpaired"', timeout=20000)
        step('sem a cópia: armazenamento novo pede código (o defeito de antes)')

        # 3. Com a cópia: restaura o mesmo login e o mesmo pareamento, sem código novo.
        ctx_b = await b.new_context()
        await ctx_b.add_init_script(f'window.__conexaoSalva = {json.dumps(salva)};')
        novo = await ctx_b.new_page()
        novo.on('pageerror', lambda e: errors.append(f'caixa B: {e}'))
        await novo.goto(HARNESS)
        await novo.wait_for_function('window.vx && window.conexao && window.conexao.uid', timeout=20000)
        assert await novo.evaluate('window.restaurou') is True
        assert await novo.evaluate('window.conexao.uid') == salva['uid'], 'outro login'
        await novo.wait_for_timeout(6000)  # passa da confirmação do servidor (4 s)
        st = await estado(novo)
        assert st['status'] == 'paired', st
        await novo.evaluate("window.vx.orderPreparing({ id: 'r1', number: 77, customerName: 'Ana Souza' })")
        await novo.wait_for_function('window.vx.getState().pending === 0 && !!window.vx.getState().lastSentAt', timeout=15000)
        assert not (await estado(novo)).get('lastError')
        step('armazenamento novo + cópia: mesmo caixa, continua conectado e o servidor aceita os pedidos')

        await panel.reload()
        await expect(panel.locator('table').first.locator('tbody tr')).to_have_count(1, timeout=10000)
        step('painel continua com um caixa só (não criou outro)')

        # 4. Desconectado no painel: o caixa larga o pareamento e diz por quê.
        await panel.get_by_role('button', name='Desconectar').first.click()
        await panel.get_by_role('dialog').get_by_role('button', name='Desconectar').click()
        await novo.wait_for_function('window.vx.getState().status === "unpaired"', timeout=20000)
        st = await estado(novo)
        assert 'desconectado no painel' in (st.get('error') or ''), st
        assert (await novo.evaluate('window.conexao.dispositivo')) is None
        step('desconectado no painel: o caixa mostra o motivo e a cópia fica sem pareamento')

        assert not errors, errors
        await b.close()
        print('CONEXÃO OK')

asyncio.run(main())
