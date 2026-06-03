SITE DIESEL REPORT
======================================

This dashboard is FULLY DATA-DRIVEN. It contains no sample data and no
hardcoded values. Every displayed figure is read at runtime from the CSV
files in /data. If a file is missing or empty, the affected area shows
"Data not loaded" instead of any placeholder number.

FILES
  index.html      Markup (labels/chrome only — no data values)
  style.css       Premium dark theme (glassmorphism, gradients)
  script.js       CSV loaders, charts, KPIs, alerts, navigation
  data/*.csv       Data source files — currently BLANK TEMPLATES (headers/keys only)

HOW TO RUN
  The dashboard fetches the CSV files, so it must be served over HTTP
  (opening index.html via file:// is blocked by the browser).
  From inside this folder:
      python3 -m http.server 8000
  then open  http://localhost:8000

REQUIREMENTS (CDN, internet on the viewing machine)
  Chart.js 4.4.1  and  Google Fonts (Fraunces + IBM Plex).
  To run offline, download those two and reference them locally.

HOW VALUES ARE MAPPED
-----------------------------------------------------------------
1) data/executive_kpi.csv   columns: metric,value,unit,delta_pct
   The KPI cards are keyed by `metric`. Fill the `value` column.
   Recognised metric keys (exact spelling):
       total_diesel_received
       total_diesel_issued
       current_balance
       average_daily_issued
       total_transactions
       active_assets
       no_asset_quantity
       no_asset_transactions
       no_asset_pct
   `delta_pct` is optional (the small "vs prior period" change chip).
   Any blank value renders as "—". Missing file => all cards "Data not loaded".

2) data/monthly_summary.csv  columns: month,received_litres,issued_litres,balance_litres
   One row per month. Feeds: Monthly Diesel Trend, Running Balance,
   Net Movement, and consumption-volatility alert.

3) data/no_asset_kpi.csv     columns: month,no_asset_qty,no_asset_transactions,total_transactions,no_asset_pct
   One row per month. Feeds: No-Asset Analysis, Exception trend/combo charts,
   risk band, and no-asset alerts.

4) data/asset_summary.csv    columns: asset_code,asset_name,category,consumed_litres,transactions,utilisation_pct
   One row per asset. Feeds: Top 10 Consumers, Asset leaderboard,
   Category doughnut, Utilisation scatter, Lead-consumer alert.

5) data/project_info.csv     columns: field,value
   Recognised fields: project_name, client, report_period, last_refresh,
   site_location, report_owner.
   Feeds the Project Information panel, the period pill, the refresh stamps,
   and the header avatar initials (from report_owner).

NOTES
  - Nothing is invented: project name, client, site, period, refresh date,
    transaction count, diesel quantities and asset count ALL come from CSV.
  - Replace the blank templates with your real exports, keeping the same
    column headers / metric keys. The dashboard populates automatically.
