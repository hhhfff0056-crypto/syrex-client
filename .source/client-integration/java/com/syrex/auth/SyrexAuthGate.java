package com.syrex.auth;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;

import java.util.Objects;
import java.util.function.Supplier;

/**
 * Connect this from the actual client's initialization lifecycle, AFTER
 * Minecraft has initialized its GUI/render thread. Does not patch Minecraft
 * automatically: the host project must call showLogin(...).
 */
public final class SyrexAuthGate {
    private static volatile SyrexAccountClient.LoginResult session;

    private SyrexAuthGate() { }

    public static void showLogin(String supabasePublishableKey,
                                 Supplier<String> localHwidProvider) {
        Objects.requireNonNull(localHwidProvider, "localHwidProvider");
        SyrexAccountClient api = new SyrexAccountClient(
            "https://schhzjmsgdjicoiadoqx.supabase.co",
            supabasePublishableKey
        );
        Minecraft minecraft = Minecraft.getInstance();
        minecraft.execute(() -> {
            Screen previous = minecraft.screen == null
                ? new TitleScreen() : minecraft.screen;
            minecraft.setScreen(new SyrexLoginScreen(
                previous,
                api,
                localHwidProvider,
                result -> {
                    session = result;
                    minecraft.setScreen(previous);
                }
            ));
        });
    }

    /** In-memory session; never write access/refresh tokens into logs. */
    public static SyrexAccountClient.LoginResult getSession() {
        return session;
    }

    public static boolean isAuthenticated() {
        return session != null;
    }

    /** This is a UI convenience; the server decides real Premium access. */
    public static boolean hasPremium() {
        return session != null && session.premium();
    }

    public static void logout() {
        session = null;
    }
}
