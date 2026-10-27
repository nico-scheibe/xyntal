// Optionale Projektdetails (Ziele, Tags, Links, Team), die das Backend noch nicht liefert.
// Später: Felder aus der API mergen; bis dahin per Projekt-ID ergänzen oder leer lassen.
window.XyntalProjectExtras = {
  byId: Object.create(null),
  for(p) {
    const extra = this.byId[p?.id] || {};
    return {
      goals: Array.isArray(extra.goals) ? extra.goals : [],
      tags: Array.isArray(extra.tags) ? extra.tags : [],
      links: Array.isArray(extra.links) ? extra.links : [],
      team: Array.isArray(extra.team) ? extra.team : [],
      timeframe: typeof extra.timeframe === "string" ? extra.timeframe : "",
    };
  },
};
