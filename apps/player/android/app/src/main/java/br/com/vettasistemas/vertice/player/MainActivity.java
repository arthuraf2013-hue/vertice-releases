package br.com.vettasistemas.vertice.player;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

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
        installRecovery();
    }

    /**
     * À prova de loja: se a página (WebView) cair por falta de memória ou o app quebrar,
     * o player se reabre sozinho em 3 segundos em vez de deixar a TV na tela inicial do Android.
     */
    private void installRecovery() {
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public boolean onRenderProcessGone(WebView webView, RenderProcessGoneDetail detail) {
                Log.e("Vertice", "WebView caiu (crash=" + (Build.VERSION.SDK_INT >= 26 && detail.didCrash()) + "), reabrindo");
                scheduleRelaunch(MainActivity.this, 3000);
                finishAndRemoveTask();
                android.os.Process.killProcess(android.os.Process.myPid());
                return true;
            }
        });
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            Log.e("Vertice", "Falha no app, reabrindo", error);
            scheduleRelaunch(getApplicationContext(), 3000);
            if (previous != null) previous.uncaughtException(thread, error);
            else System.exit(2);
        });
    }

    /** Agenda a abertura do player daqui a alguns milissegundos (sobrevive ao fim do processo). */
    static void scheduleRelaunch(Context ctx, long delayMs) {
        Intent i = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        int flags = PendingIntent.FLAG_CANCEL_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(ctx, 4242, i, flags);
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.set(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + delayMs, pi);
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
