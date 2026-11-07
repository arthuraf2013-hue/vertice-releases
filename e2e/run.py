"""Teste ponta a ponta com os emuladores do Firebase.

Requer: emuladores (auth, firestore), servidor de mídias (servers/media) e os três builds servidos:
  painel  → http://localhost:4300   (apps/panel/dist-e2e)
  player  → http://localhost:4301   (apps/player/dist-e2e)
  harness → http://localhost:4302   (e2e/harness/dist, simula o GerenciaAI)
"""
import asyncio, re, base64, os, sys, time
from playwright.async_api import async_playwright, expect

PANEL, PLAYER, HARNESS = 'http://localhost:4300/', 'http://localhost:4301/', 'http://localhost:4302/'
SHOTS = sys.argv[1] if len(sys.argv) > 1 else '/tmp/e2e'
os.makedirs(SHOTS, exist_ok=True)
CHROME = os.environ.get('CHROME')  # vazio = Chromium do Playwright

# PNG 16x9 de teste
PNG = os.path.join(SHOTS, 'oferta.png')

def step(msg):
    print(f'✔ {msg}', flush=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(**({'executable_path': CHROME} if CHROME else {}), args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        errors = []
        def watch(page, name):
            page.on('pageerror', lambda e: errors.append(f'{name}: {e}'))

        # Gera a imagem da oferta com o próprio navegador.
        art = await b.new_page(viewport={'width': 1280, 'height': 720})
        await art.set_content('<div style="width:1280px;height:720px;background:#141b26;color:#fff;font:700 96px sans-serif;display:grid;place-items:center">Oferta E2E · R$ 9,90</div>')
        await art.screenshot(path=PNG)
        await art.close()

        panel = await b.new_page(viewport={'width': 1440, 'height': 900}); watch(panel, 'painel')
        tv = await b.new_page(viewport={'width': 1280, 'height': 720}); watch(tv, 'tv')
        pdv = await b.new_page(); watch(pdv, 'gerenciaai')

        # 1. Criar conta
        await panel.goto(PANEL)
        await panel.get_by_role('tab', name='Criar conta').click()
        await panel.get_by_label('Seu nome').fill('Arthur Teste')
        await panel.get_by_label('Nome da empresa').fill('Padaria E2E')
        await panel.get_by_label('E-mail').fill(f'arthur{int(time.time())}@teste.com')
        await panel.get_by_label('Senha').fill('segredo123')
        await panel.get_by_role('button', name='Criar conta').click()
        await expect(panel.get_by_text('Arthur.', exact=False).first).to_be_visible(timeout=15000)
        step('conta criada e dashboard aberto')

        # 2. TV mostra o código
        await tv.goto(PLAYER)
        code_el = tv.locator('.tv-code')
        await expect(code_el).to_be_visible(timeout=20000)
        code = (await code_el.inner_text()).replace('·', '').replace(' ', '').strip()
        assert len(code) == 6, code
        await tv.screenshot(path=f'{SHOTS}/1-tv-pareamento.png')
        step(f'TV mostrou o código {code}')

        # 3. Parear no painel
        await panel.goto(PANEL + '#/telas?parear=1')
        await panel.locator('#pair-code').fill(code)
        await panel.get_by_placeholder('Ex.: Caixa 1, Vitrine').fill('Balcão')
        await panel.get_by_role('button', name='Conectar tela').click()
        await expect(panel.get_by_text('Tela conectada')).to_be_visible(timeout=15000)
        await panel.keyboard.press('Escape')
        await expect(tv.get_by_text('Nada programado para agora')).to_be_visible(timeout=20000)
        step('tela pareada; TV saiu do pareamento')
        await panel.goto(PANEL + '#/telas')
        await expect(panel.locator('.vx-device .vx-badge-online')).to_be_visible(timeout=20000)
        step('painel vê a TV online (sinal de vida)')

        # 4. Mídia → playlist → grade
        await panel.goto(PANEL + '#/midias')
        await panel.locator('input[type=file]').set_input_files(PNG)
        await expect(panel.locator('.vx-media-card')).to_have_count(1, timeout=20000)
        import glob
        files = glob.glob('/tmp/vx-e2e-media/*/*.png')
        assert files, 'arquivo não chegou ao servidor de mídias'
        step(f'mídia enviada ao servidor próprio ({len(files)} arquivo)')
        await panel.goto(PANEL + '#/playlists')
        await panel.get_by_role('button', name='Nova playlist').first.click()
        await panel.get_by_label('Nome').fill('Ofertas')
        await panel.locator('.vx-pl-pick').first.click()
        await panel.get_by_role('button', name='Salvar playlist').click()
        await expect(panel.locator('.vx-playlist-card')).to_have_count(1, timeout=10000)
        step('playlist criada')
        await panel.goto(PANEL + '#/programacao')
        await panel.get_by_role('button', name='Nova grade').click()
        await panel.get_by_label('Nome da grade').fill('Grade E2E')
        await panel.get_by_role('button', name='Balcão').click()
        # Faixa padrão (seg–sex 8h–18h) + playlist padrão fora do horário: toca a qualquer hora.
        await panel.locator('.vx-slot select').first.select_option(label='Ofertas')
        await panel.get_by_label('Fora dos horários, tocar').select_option(label='Ofertas')
        await panel.get_by_role('button', name='Publicar').click()
        await expect(panel.get_by_text('Publicada').first).to_be_visible(timeout=10000)
        step('grade publicada')
        await expect(tv.locator('img.tv-media')).to_be_visible(timeout=30000)
        src = await tv.locator('img.tv-media').get_attribute('src')
        assert src, 'TV sem mídia'
        await tv.wait_for_timeout(1500)
        await tv.screenshot(path=f'{SHOTS}/2-tv-tocando.png')
        step('TV tocando a mídia da grade')

        # 5. GerenciaAI
        await pdv.goto(HARNESS)
        await pdv.wait_for_function('window.vx && window.vx.getState().status === "unpaired"', timeout=20000)
        icode = await pdv.evaluate('window.vx.startPairing()')
        step(f'GerenciaAI gerou o código {icode}')
        await panel.goto(PANEL + '#/empresa?aba=integracoes')
        await panel.get_by_role('button', name='Conectar caixa').click()
        await panel.locator('#int-code').fill(icode)
        await panel.get_by_role('dialog').get_by_role('button', name='Conectar').click()
        await pdv.wait_for_function('window.vx.getState().status === "paired"', timeout=20000)
        step('GerenciaAI conectado')

        # 6. Tela vira painel de pedidos
        await panel.goto(PANEL + '#/telas')
        await panel.locator('.vx-device').first.click()
        await panel.get_by_role('button', name='Painel dedicado').click()
        await panel.get_by_role('button', name='Salvar').click()
        await expect(tv.locator('.tv-board')).to_be_visible(timeout=20000)
        step('TV mudou para o painel de pedidos')

        await pdv.evaluate("window.vx.orderPreparing({ id: 'v1', number: 152, customerName: 'MARIA DA SILVA' })")
        await pdv.evaluate("window.vx.orderPreparing({ id: 'v2', number: 153, customerName: 'João Pedro' })")
        await expect(tv.locator('.tv-board-prep').get_by_text('152')).to_be_visible(timeout=15000)
        step('pedido em preparo apareceu na TV')
        await pdv.evaluate("window.vx.orderReady({ id: 'v1', number: 152, customerName: 'MARIA DA SILVA' })")
        await expect(tv.locator('.tv-board-hero')).to_contain_text('152', timeout=15000)
        await expect(tv.locator('.tv-board-hero')).to_contain_text('Maria S.')
        await tv.wait_for_timeout(800)
        await tv.screenshot(path=f'{SHOTS}/3-tv-pedido-pronto.png')
        step('pedido pronto em destaque: "152 · Maria S."')
        await pdv.evaluate("window.vx.orderDelivered({ id: 'v1', number: 152 })")
        await expect(tv.locator('.tv-board-hero')).to_have_count(0, timeout=15000)
        step('pedido entregue saiu da TV')
        await pdv.evaluate('window.vx.sendTestOrder()')
        await expect(tv.locator('.tv-board-hero')).to_contain_text('TESTE', timeout=15000)
        await pdv.wait_for_function('window.vx.getState().pending === 0 && !!window.vx.getState().lastSentAt', timeout=15000)
        step('pedido de teste do GerenciaAI chegou à TV')

        # 6a. Controle remoto: o comando do painel chega à TV e ela responde.
        await panel.goto(PANEL + '#/telas')
        await panel.locator('.vx-device').first.click()
        rc = panel.get_by_role('dialog').last.locator('.vx-subsection').filter(has_text='Controle remoto').first
        await rc.get_by_role('button', name='Identificar').click()
        await expect(tv.locator('.vx-op-identify')).to_be_visible(timeout=20000)
        await expect(rc.locator('.vx-remote-ack')).to_contain_text('Código mostrado', timeout=20000)
        await rc.get_by_role('button', name='Atualizar diagnóstico').click()
        await expect(rc.locator('.vx-remote-diag dl')).to_be_visible(timeout=20000)
        await panel.screenshot(path=f'{SHOTS}/6-painel-controle-remoto.png')
        await panel.keyboard.press('Escape')
        step('controle remoto: a TV se identificou e mandou o diagnóstico')
        # Menu do operador pelo "controle": uma tecla mostra o botão, OK abre, Esc fecha.
        await tv.keyboard.press('ArrowDown')
        await expect(tv.locator('.vx-op-fab')).to_be_visible(timeout=5000)
        await tv.keyboard.press('Enter')
        await expect(tv.locator('.vx-op-panel')).to_be_visible(timeout=5000)
        await tv.screenshot(path=f'{SHOTS}/7-tv-menu-operador.png')
        await tv.keyboard.press('Escape')
        await expect(tv.locator('.vx-op-panel')).to_have_count(0)
        step('menu do operador abre e fecha pelo controle')

        # 6b. Posição na TV: rotação e ajuste de uma mídia só nesta tela (ao vivo)
        await panel.goto(PANEL + '#/telas')
        await panel.locator('.vx-device').first.click()
        dlg = panel.get_by_role('dialog').last
        await dlg.get_by_role('button', name='Desligado').click()
        await dlg.get_by_role('radio', name='90°').click()
        await dlg.get_by_role('button', name='Salvar').click()
        await expect(tv.locator('.tv-root')).to_have_attribute('style', re.compile(r'rotate\(90deg\)'), timeout=20000)
        await expect(tv.locator('img.tv-media').last).to_be_visible(timeout=20000)
        step('TV girou 90° (instalação vertical)')
        await panel.locator('.vx-device').first.click()
        dlg = panel.get_by_role('dialog').last
        await dlg.locator('.vx-madj-item').first.click()
        adj = panel.get_by_role('dialog').last
        await adj.locator('input[aria-label=Tamanho]').fill('130')
        await adj.get_by_role('button', name='Fixar na TV').click()
        await expect(tv.locator('img.tv-media').last).to_have_attribute('style', re.compile(r'scale\(1\.3\)'), timeout=20000)
        await tv.screenshot(path=f'{SHOTS}/5-tv-girada-ajustada.png')
        step('ajuste da mídia nesta tela apareceu ao vivo na TV')
        await adj.get_by_role('button', name='Salvar ajuste').click()
        await panel.keyboard.press('Escape')

        # 7. Desconectar a tela → TV volta ao pareamento
        await panel.goto(PANEL + '#/')
        await panel.wait_for_timeout(800)
        await panel.screenshot(path=f'{SHOTS}/4-painel-dashboard.png', full_page=True)
        await panel.goto(PANEL + '#/telas')
        await panel.locator('.vx-device').first.click()
        await panel.get_by_role('button', name='Desconectar tela').click()
        await panel.get_by_role('dialog').last.get_by_role('button', name='Desconectar').click()
        await expect(tv.locator('.tv-code')).to_be_visible(timeout=20000)
        step('tela desconectada; TV voltou a mostrar um código')

        await b.close()
        bad = [e for e in errors if 'ERR_' not in e]
        if bad:
            print('ERROS NAS PÁGINAS:', *bad, sep='\n  ')
            sys.exit(1)
        print('\nTudo certo: fluxo completo funcionando.')

asyncio.run(main())
