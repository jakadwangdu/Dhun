package com.dhun.app;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BackgroundAudio")
public class BackgroundAudioPlugin extends Plugin {

    @PluginMethod
    public void startBackgroundPlayback(PluginCall call) {
        String title = call.getString("title", "Dhun Audio");
        String artist = call.getString("artist", "Playing");

        try {
            Intent serviceIntent = new Intent(getContext(), BackgroundAudioService.class);
            serviceIntent.setAction(BackgroundAudioService.ACTION_PLAY);
            serviceIntent.putExtra("title", title);
            serviceIntent.putExtra("artist", artist);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to start background audio service: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void stopBackgroundPlayback(PluginCall call) {
        try {
            Intent serviceIntent = new Intent(getContext(), BackgroundAudioService.class);
            serviceIntent.setAction(BackgroundAudioService.ACTION_STOP);
            getContext().startService(serviceIntent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to stop background audio service: " + e.getMessage(), e);
        }
    }
}
