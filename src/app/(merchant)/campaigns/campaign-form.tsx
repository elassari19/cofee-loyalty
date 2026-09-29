"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";

import { createCampaign } from "@/lib/actions";
import {
  CAMPAIGN_AUDIENCES,
  campaignSchema,
  type CampaignValues,
} from "@/lib/schemas";
import {
  AppForm,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
  useZodForm,
} from "@/components/patterns/form";
import { notify } from "@/components/patterns/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const EMPTY: CampaignValues = {
  name: "",
  audience: "All customers",
  startsOn: "",
  endsOn: "",
  terms: "",
};

export function NewCampaignButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useZodForm(campaignSchema, { defaultValues: EMPTY });

  async function onSubmit(values: CampaignValues) {
    const result = await createCampaign(values);
    if (result.ok) {
      notify.success(
        `“${result.data.name}” saved as a draft for ${result.data.audience}.`,
      );
      form.reset(EMPTY);
      setOpen(false);
      router.refresh();
    } else {
      notify.error(result.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon aria-hidden="true" />
        New campaign
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New campaign</DialogTitle>
          <DialogDescription>
            Saved as a draft — nothing is shown to customers until publishing
            ships. Dates are validated before the save.
          </DialogDescription>
        </DialogHeader>

        <AppForm form={form} onSubmit={onSubmit} className="gap-4">
          <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
            <TextField
              form={form}
              name="name"
              label="Campaign name"
              placeholder="Double points Friday"
              required
              className="sm:col-span-2"
            />
            <SelectField
              form={form}
              name="audience"
              label="Audience"
              options={CAMPAIGN_AUDIENCES.map((audience) => ({
                value: audience,
                label: audience,
              }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField
                form={form}
                name="startsOn"
                label="Starts"
                type="date"
                required
              />
              <TextField
                form={form}
                name="endsOn"
                label="Ends"
                type="date"
                required
              />
            </div>
            <TextAreaField
              form={form}
              name="terms"
              label="Terms"
              description="What the offer gives and any limits."
              rows={3}
              className="sm:col-span-2"
            />
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancel
            </DialogClose>
            <SubmitButton pending={form.formState.isSubmitting}>
              Save draft
            </SubmitButton>
          </DialogFooter>
        </AppForm>
      </DialogContent>
    </Dialog>
  );
}
