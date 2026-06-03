DIESEL EXECUTIVE INTELLIGENCE PLATFORM
======================================

FILES
  index.html      Dashboard markup
  style.css       Premium dark theme (glassmorphism, gradients)
  script.js       CSV loaders, charts, KPIs, alerts, navigation
  data/*.csv       Data source files (replace with your real exports)

HOW TO RUN
  The dashboard fetches the CSV files, so it must be served over HTTP
  (opening index.html directly via file:// will be blocked by the browser).

  From inside this folder:
      python3 -m http.server 8000
  then open  http://localhost:8000  in your browser.

  (Any static host works: Netlify, Nginx, IIS, S3, SharePoint, etc.)

REQUIREMENTS
  Internet access on the viewing machine for two CDNs:
    - Chart.js 4.4.1   (charts)
    - Google Fonts      (Fraunces + IBM Plex)
  To run fully offline, download those two and reference them locally.

PLUGGING IN YOUR REAL DATA
  Replace the files in /data with your exports, keeping the SAME column
  headers. The dashboard re-populates automatically — no code changes.

    executive_kpi.csv   metric,value,unit,delta_pct
    monthly_summary.csv  month,received_litres,issued_litres,balance_litres
    no_asset_kpi.csv     month,no_asset_qty,no_asset_transactions,total_transactions,no_asset_pct
    asset_summary.csv    asset_code,asset_name,category,consumed_litres,transactions,utilisation_pct
    project_info.csv     field,value

NOTE
  The bundled CSV values are realistic placeholders (the uploaded
  Diesel_Executive_Report.xlsx did not arrive on the build side).
  Swap in your real numbers as above.
