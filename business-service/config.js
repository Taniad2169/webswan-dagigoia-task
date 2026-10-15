// WebSwan Business Service - prices and estimated government fees.
// Edit this file to change prices. Government fees were checked Oct 2026 and can change at any time.
window.WSBS_CONFIG = {
  brand: "WebSwan Business Service",
  phone: "(239) 667-0151",
  email: "designs@thewebswan.com",
  disclosureVersion: "2026-10-14",
  services: [
    { id: "ein", name: "EIN application assistance", fee: 69, feeText: "$69",
      desc: "We help you prepare and submit your IRS Employer Identification Number (EIN) application. The IRS does not charge for an EIN." },
    { id: "license-existing", name: "Existing business license application", fee: 99, feeText: "$99",
      desc: "Help preparing a license or permit application for a business that already exists (renewals, new location, added activity)." },
    { id: "license-new", name: "New business license registration assistance", fee: 149, feeText: "$149",
      desc: "We help you identify the general state and local registrations most businesses need and prepare the applications." },
    { id: "llc", name: "LLC formation assistance", fee: 199, feeText: "$199 to $299",
      desc: "We prepare and file your LLC formation documents with the state. You pay the $199 starting fee when you submit. If your filing needs more work (up to $299), Tania confirms it with you before any extra charge." },
    { id: "package", name: "Business startup package", fee: 299, feeText: "$299 to $399",
      desc: "LLC formation + EIN + general business license assistance in one package. You pay the $299 starting fee when you submit. If your filing needs more work (up to $399), Tania confirms it with you before any extra charge." }
  ],
  states: {
    NY: { name: "New York",
      llc: "$200 filing fee (NY Department of State). New York also requires LLCs to publish a notice in two newspapers within 120 days, then file a Certificate of Publication ($50). Newspaper costs vary by county and can be several hundred dollars or more.",
      license: "New York State has no single general business license. Licenses and permits depend on your city, county and type of business (for example, a sales tax Certificate of Authority, which is free).",
      ein: "$0. The IRS issues EINs for free.",
      ongoing: "Biennial Statement every 2 years ($9)." },
    FL: { name: "Florida",
      llc: "$125 filing fee (Florida Division of Corporations), including the registered agent designation.",
      license: "Florida has no single general state business license. Most cities and counties require a local Business Tax Receipt; fees vary by location and business type. Some professions need a state license (DBPR).",
      ein: "$0. The IRS issues EINs for free.",
      ongoing: "Annual Report every year between January 1 and May 1 ($138.75). A $400 late fee applies after May 1." },
    WA: { name: "Washington",
      llc: "$200 to file the Certificate of Formation online with the Washington Secretary of State (includes the Initial Report).",
      license: "Most businesses must file a Washington State Business License Application with the Department of Revenue (about $50), plus any city or state endorsement fees, which vary.",
      ein: "$0. The IRS issues EINs for free.",
      ongoing: "Annual Report every year ($60)." },
    TX: { name: "Texas",
      llc: "$300 filing fee for the Certificate of Formation (Form 205) with the Texas Secretary of State.",
      license: "Texas has no single general state business license. Local permits, an assumed name (DBA) certificate, a free sales tax permit or industry licenses may apply depending on your business and city.",
      ein: "$0. The IRS issues EINs for free.",
      ongoing: "Annual franchise tax report and Public Information Report to the Texas Comptroller (no tax due for most small businesses under the threshold, but the report is still required)." }
  },
  // Admin quick links to official filing sites (and Bizee, which Tania uses for LLC filings)
  filingLinks: {
    ALL: [
      ["Bizee (LLC filing)", "https://bizee.com/"],
      ["IRS: apply for an EIN online (free)", "https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online"]
    ],
    NY: [
      ["NY Dept. of State: form an LLC", "https://dos.ny.gov/forming-limited-liability-company-new-york"],
      ["NY Business Express (licenses & permits)", "https://www.businessexpress.ny.gov/"],
      ["NY sales tax Certificate of Authority", "https://www.tax.ny.gov/bus/st/register.htm"]
    ],
    FL: [
      ["Sunbiz: file a Florida LLC", "https://dos.fl.gov/sunbiz/start-business/efile/fl-llc/"],
      ["Sunbiz: annual report", "https://dos.fl.gov/sunbiz/manage-business/efile/annual-report/"],
      ["Sunbiz: fictitious name (DBA)", "https://dos.fl.gov/sunbiz/start-business/efile/fictitious-name-registration/"],
      ["Florida DBPR (professional licenses)", "https://www2.myfloridalicense.com/"],
      ["Florida sales tax registration", "https://floridarevenue.com/taxes/registration/Pages/default.aspx"]
    ],
    WA: [
      ["WA Secretary of State CCFS (LLC + annual report)", "https://ccfs.sos.wa.gov/"],
      ["WA Business License Application (DOR)", "https://dor.wa.gov/open-business/apply-business-license"]
    ],
    TX: [
      ["Texas SOSDirect (file Form 205 LLC)", "https://www.sos.state.tx.us/corp/sosda/index.shtml"],
      ["Texas SOS business forms", "https://www.sos.state.tx.us/corp/forms_boc.shtml"],
      ["Texas sales tax permit (Comptroller)", "https://comptroller.texas.gov/taxes/permit/"],
      ["Texas franchise tax / PIR", "https://comptroller.texas.gov/taxes/franchise/"],
      ["Texas TDLR (industry licenses)", "https://www.tdlr.texas.gov/"]
    ]
  },
  apiBase: "https://webswan-billing.netlify.app/.netlify/functions"
};
