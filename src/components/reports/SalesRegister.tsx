
"use client";

import { useVouchers } from "@/hooks/useVouchers";
import { useState, useMemo, useCallback, useEffect } from "react";
import { TransactionsTable } from "../vouchers/TransactionsTable";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../ui/card";
import { asCalendarRange, type DateRange } from "@/components/ui/ad-calendar";
import { useDate } from "@/hooks/useDate";
import { useCalendarMonths } from "@/hooks/use-mobile";

import BsDatePicker from "../ui/BsDatePicker";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Printer } from "lucide-react";
import { Calendar } from "../ui/calendar";
import { doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

export function SalesRegister() {
  const { vouchers, loading } = useVouchers();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const { dateSystem } = useDate();
                              selected={asCalendarRange(dateRange)}
                              onSelect={setDateRange}
                              numberOfMonths={calendarMonths}

                          />
                      </PopoverContent>
                  </Popover>
              )}
               {dateRange && <Button variant="ghost" onClick={() => setDateRange(undefined)}>Clear</Button>}
          </div>
        </CardHeader>
        <CardContent>
          <TransactionsTable transactions={salesVouchers} context="daybook" userNames={userNames} />
        </CardContent>
      </Card>
    </div>
  );
}
