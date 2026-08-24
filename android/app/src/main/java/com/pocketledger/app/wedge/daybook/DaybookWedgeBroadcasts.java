package com.pocketledger.app.wedge.daybook;

import android.content.Context;
import android.content.Intent;
import com.pocketledger.app.wedge.shared.WedgeUpdateDispatcher;

/** Broadcast handling for bank/cash summary wedge. */
final class DaybookWedgeBroadcasts {
    private DaybookWedgeBroadcasts() {}

    static boolean dispatch(Context context, Intent intent) {
        if (intent == null) return false;
        String action = intent.getAction();
        if (action == null) return false;

        if (DaybookWedgeActions.ACTION_PREV_DAY.equals(action)
            || DaybookWedgeActions.ACTION_NEXT_DAY.equals(action)
            || DaybookWedgeActions.ACTION_TODAY_DAY.equals(action)) {
            if (DaybookWedgeBindUtil.handleDayAction(context, action)) {
                WedgeUpdateDispatcher.refreshDaybookWidgetData(context);
            }
            return true;
        }

        return false;
    }
}
