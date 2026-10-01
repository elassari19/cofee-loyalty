"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon, QrCodeIcon } from "lucide-react";

import { notify } from "@/components/patterns/toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Merchant join QR (checklist §6 bullet 7).
 *
 * The payload is the join URL — a public slug only. The image itself is
 * generated on the server (`QRCode.toDataURL`) from that same URL, so this
 * component never invents a second, possibly different, payload. Copying the
 * link is a convenience for putting it on receipts and tables.
 */
export function JoinQrCard({
  businessName,
  joinUrl,
  qrDataUrl,
}: {
  businessName: string;
  joinUrl: string;
  qrDataUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      notify.success("Join link copied — paste it anywhere.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify.error(
        "Couldn't reach the clipboard — select the link and copy it.",
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCodeIcon aria-hidden="true" className="size-4" />
          Customer join code
        </CardTitle>
        <CardDescription>
          Print or display this at {businessName}. Scanning it opens the join
          page — the code carries no personal or customer data.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          alt={`QR code linking to ${joinUrl}`}
          width={176}
          height={176}
          className="size-44 shrink-0 rounded-lg border bg-white p-2"
        />
        <div className="flex w-full min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Join link
            </span>
            <a
              href={joinUrl}
              className="text-sm font-medium break-all hover:underline"
            >
              {joinUrl}
            </a>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void copyLink()}
            >
              {copied ? (
                <CheckIcon aria-hidden="true" />
              ) : (
                <CopyIcon aria-hidden="true" />
              )}
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button type="button" variant="ghost" render={<a href={joinUrl} />}>
              Open join page
            </Button>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Customers who scan this will create their own account (§7) — you
            never share a customer QR from here.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
