import { GiftIcon } from "lucide-react";

import type { LoyaltyType } from "@/db/entities/enums";
import { summarizeProgram } from "@/features/loyalty/schemas";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Customer-facing program preview (checklist §6 bullet 6).
 *
 * Deliberately plain data → presentational: the same component renders on the
 * reward step, the launch page and the loyalty settings page, so what the
 * owner reviews before activating is built from exactly the stored rule set —
 * never a hand-written mock of it.
 */

export interface PreviewReward {
  id: string;
  name: string;
  description: string | null;
  cost: number;
}

export function ProgramPreview({
  businessName,
  programName,
  description,
  type,
  unitName,
  configuration,
  currency,
  rewards = [],
}: {
  businessName: string;
  programName: string;
  description: string | null;
  type: LoyaltyType;
  unitName: string | null;
  configuration: unknown;
  currency: string;
  rewards?: PreviewReward[];
}) {
  const bullets = summarizeProgram({ type, unitName, configuration, currency });
  const unit = unitName ?? (type === "POINTS" ? "points" : "stamps");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {programName}
          <Badge variant="secondary">
            {type === "POINTS" ? "Points" : "Stamps"}
          </Badge>
        </CardTitle>
        <CardDescription>
          {description || `Loyalty program at ${businessName}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-1.5 text-sm">
          {bullets.map((bullet) => (
            <li key={bullet} className="flex gap-2">
              <span aria-hidden="true" className="text-primary">
                •
              </span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Rewards
          </span>
          {rewards.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No rewards yet — customers can&apos;t redeem until you add one.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rewards.map((reward) => (
                <li
                  key={reward.id}
                  className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <GiftIcon
                        aria-hidden="true"
                        className="size-3.5 shrink-0"
                      />
                      {reward.name}
                    </span>
                    {reward.description ? (
                      <span className="text-muted-foreground text-xs">
                        {reward.description}
                      </span>
                    ) : null}
                  </span>
                  <Badge variant="outline" className="shrink-0">
                    {reward.cost} {unit}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-muted-foreground border-t pt-3 text-xs leading-relaxed">
          This is what customers see after they scan your join code and sign up.
          The join link itself contains only your public slug — no customer or
          personal data.
        </p>
      </CardContent>
    </Card>
  );
}
