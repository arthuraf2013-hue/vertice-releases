package br.com.vettasistemas.vertice.player;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.util.Log;

/** Resultado da instalação do APK novo (ver VerticeHostPlugin.installApk). */
public class InstallReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        String resultado;
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            // O Android quer um "Instalar" na tela. Só mostramos quando o operador pediu.
            if (intent.getBooleanExtra("interactive", false)) {
                Intent confirmar = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                if (confirmar != null) {
                    confirmar.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    try {
                        context.startActivity(confirmar);
                    } catch (Exception e) {
                        Log.w("VerticeHost", "Não abriu a confirmação de instalação", e);
                    }
                }
                resultado = "waiting-confirmation";
            } else {
                resultado = "needs-confirmation";
            }
        } else if (status == PackageInstaller.STATUS_SUCCESS) {
            resultado = "installed";
        } else {
            resultado = "error: " + (msg != null ? msg : status);
        }
        context.getSharedPreferences("VerticeHost", Context.MODE_PRIVATE).edit().putString("apkStatus", resultado).apply();
    }
}
