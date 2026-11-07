package br.com.vettasistemas.vertice.player;

import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Ponte com o Android: menu do operador, diagnóstico e atualização automática.
        registerPlugin(VerticeHostPlugin.class);
        super.onCreate(savedInstanceState);
        // Tela sempre acesa enquanto o player estiver aberto.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // Vídeos e o aviso sonoro de pedido pronto tocam sem precisar de toque na tela.
        WebSettings settings = getBridge().getWebView().getSettings();
        settings.setMediaPlaybackRequiresUserGesture(false);
        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    /** Tela cheia de verdade: sem barra de status nem de navegação. */
    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN);
    }

    /** O botão "voltar" do controle não fecha o player: abre ou fecha o menu do operador. */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (getBridge() != null) getBridge().triggerWindowJSEvent("vxback");
    }

    /** Tecla "Menu" (ou "Opções") do controle abre o menu do operador. */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int k = event.getKeyCode();
        if (k == KeyEvent.KEYCODE_MENU || k == KeyEvent.KEYCODE_SETTINGS) {
            if (event.getAction() == KeyEvent.ACTION_UP && getBridge() != null) getBridge().triggerWindowJSEvent("vxmenu");
            return true;
        }
        return super.dispatchKeyEvent(event);
    }
}
