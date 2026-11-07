package br.com.vettasistemas.vertice.player;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** Abre o player quando o aparelho liga ou quando o app é atualizado. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (action == null) return;
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
            && !"android.intent.action.QUICKBOOT_POWERON".equals(action)
            && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) return;
        try {
            Intent launch = new Intent(context, MainActivity.class);
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            context.startActivity(launch);
        } catch (Exception e) {
            Log.w("VerticeBoot", "Não foi possível abrir o player no boot", e);
        }
    }
}
