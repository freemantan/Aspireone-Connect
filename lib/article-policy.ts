// Uploaded HTML runs in an opaque origin: never add allow-same-origin.
// Permit the pinned chart library used by reports, but no API connections.
export function articlePolicy(type:string){
 return type==='text/html'
  ? "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js; style-src 'unsafe-inline' https://fonts.googleapis.com; img-src data:; font-src data: https://fonts.gstatic.com; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"
  : "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
}
