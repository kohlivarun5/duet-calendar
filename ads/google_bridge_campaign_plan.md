# Google Ads Bridge Campaign Plan

Date: May 16, 2026
Status: Ready for manual Google Ads setup; live creation is blocked by Adspirer quota until May 31, 2026.

## Goal

Create a separate Search campaign that sends traffic to the Duet bridge page, records one valid website conversion from the App Store CTA, and qualifies the Google Ads $300 credit without disturbing the current App Store-direct campaign.

## Campaign

- Customer ID: `6624784803`
- Campaign name: `DUET_SEARCH_BRIDGE_CTA_2026_05`
- Campaign type: Search
- Network: Google Search only
- Location: United States
- Language: English
- Status at creation: Paused
- Daily budget: `$10`
- Bidding: Maximize clicks with a tight CPC cap if available, or Manual CPC if Google Ads requires manual setup
- Final URL: `https://kohlivarun5.github.io/duet-calendar/`

## Conversion Action

Create this before enabling the campaign:

- Source: Website
- Name: `Duet App Store CTA click`
- Category: Page view or Sign-up
- Value: Do not use a value
- Count: One
- Attribution: Data-driven if available
- Tag location: bridge site App Store CTA click

After Google Ads creates the conversion action, update `index.html`:

- `googleAdsId`: the global Google Ads tag ID, such as `AW-123456789`
- `conversionSendTo`: the full conversion destination, such as `AW-123456789/AbCdEfGhIj`

Do not enable the bridge campaign until the tag is installed and Google Tag Assistant can see the global tag.

## Ad Group

Ad group name: `Co-parent schedule app`

Keywords:

- `"co parenting calendar"`
- `"co parenting app"`
- `"shared custody calendar"`
- `"custody calendar app"`
- `"parenting schedule app"`
- `"parenting time calendar"`
- `"shared parenting calendar"`
- `"custody schedule app"`
- `"visitation schedule app"`
- `"co parent scheduling app"`
- `"divorce calendar app"`
- `[co parenting calendar]`
- `[shared custody calendar]`
- `[custody calendar app]`
- `[parenting schedule app]`

## Negative Keywords

Add before enabling:

- family link
- familylink
- parental control
- parental controls
- parent control
- google family
- parent portal
- family portal
- attorney
- lawyer
- legal aid
- court
- file for divorce
- divorce papers
- child support calculator
- alimony
- mediation
- mediator
- therapist
- counseling
- restraining order
- emergency custody

## Responsive Search Ad

Headlines:

- Duet Co-parent Calendar
- Shared Custody Calendar
- Co-parent Schedules
- Plan Parenting Days
- Easier Holiday Planning
- Fewer Schedule Texts
- Know Whose Day It Is
- Built For Co-parents
- Free On The App Store
- Shared Parenting Calendar
- Organize Handoffs
- iPhone Parenting Calendar

Descriptions:

- Keep custody days, holidays, handoffs, and school events in one shared calendar.
- Duet helps separated parents stay aligned without constant schedule texts.
- Plan parenting time on iPhone and iPad. Free to start on the App Store.
- Use private iCloud sharing to keep both homes working from the same schedule.

## Claim Flow

1. Click the original Google offer email's conversion-tracking button.
2. Create the website conversion action directly in Google Ads.
3. Paste the global tag ID and conversion send-to label into `index.html`.
4. Push the tag update and verify it on the live GitHub Pages URL.
5. Create this campaign as paused.
6. Preview the campaign and confirm final URL, keywords, negatives, and ad copy.
7. Enable only this campaign until one same-device website conversion records.
8. Wait for the coupon-code email, then apply the code under Billing > Promotions.
9. Once the code is posted, pause this bridge campaign or switch budget back to the current App Store-direct setup.
