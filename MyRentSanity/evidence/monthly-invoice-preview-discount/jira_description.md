# Invoice Preview keeps the old discounted total after the Discount % is cleared on tab 3

**Environment:** rentalplustest (https://rentalplustest.myrent.it/MyRentWeb), Administrator
**Seen on:** RA-12553 (Rental Agreement, monthly rental: 3 months x 30 days, pickup 2026-09-01, Car Class A at TRN)
**Page:** Rental Agreement > Show > tab "3. Extras" > Discount % / TOTAL(EUR) / "Invoice Preview"
**Video:** `invoice_preview_stale_after_discount_cleared.webm` (about 40 s, with on-screen captions)

## Summary
After a Discount % has been saved on a rental, emptying the Discount % field on tab 3 makes the tab 3 TOTAL(EUR) drop back to the undiscounted amount, but the **Invoice Preview still shows the old discounted amount**. The two totals no longer match.

## Steps to reproduce
1. Open a Rental Agreement (here RA-12553, base total 4524.00) > tab "3. Extras".
2. Type **10** in Discount % and tab out. TOTAL(EUR) becomes 4071.60. Click **Update** to save (confirm the "another open contract for this driver" prompt with OK).
3. Open the rental again > tab "3. Extras". Discount % = 10, TOTAL(EUR) = 4071.60. Click **Invoice Preview**: Total Amount = 4071.60 (matches). Close the preview.
4. Clear the **Discount % field completely** (select the content, delete, leave it empty) and tab out.
5. Tab 3 TOTAL(EUR) changes to **4524.00**.
6. Click **Invoice Preview** again.

## Actual result
Invoice Preview "Total Amount" = **4071.60** (the old discounted value; it is still shown after waiting a few seconds and re-opening the preview).
Tab 3 TOTAL(EUR) = **4524.00**.

## Expected result
Invoice Preview "Total Amount" = **4524.00**, the same as tab 3 TOTAL(EUR) (no discount).

## Additional findings
- The Invoice Preview request (`POST /MRRentalAgreement/calculateTariffeForExtra`, `invoice=invoice`) is sent with an **empty** `discountRate=` when the field is emptied, and the preview then shows the previously saved discount. When the user types **0** instead of emptying the field, the request carries `discountRate=0` and the preview is correct (4524.00 = 4524.00).
- After pressing **Update** the discount is saved as 0, and both totals show 4524.00. The mismatch exists only between clearing the field and saving.
- Applying a discount (typing 10) on a rental with no discount works: tab 3 and the Invoice Preview both show 4071.60 straight away.
- Not checked: whether the Final Invoice created from this state carries the old discount. Please check this when triaging, because it decides the severity.

## Suggested fix direction
Treat an empty Discount % as 0 (as typing 0 already does) when the Invoice Preview request is built, or reject/restore an empty value on the field.
