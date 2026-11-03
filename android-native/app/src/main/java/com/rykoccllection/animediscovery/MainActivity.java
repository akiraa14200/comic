package com.rykoccllection.animediscovery;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LibraryBackupPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
