// 17 — Administration pages.
export default async function (page, h) {
  await h.title("Administration", "Users, access, settings and watching the system.");
  await h.as("admin");
  await h.visit("/pw-dashboard", "Dashboard: the day at a glance — OPD, admissions, lab, pharmacy and money.", "Dashboard");
  await h.visit("/users", "Users & roles: staff accounts, roles, branch and counter lock, and page access per role.", "Users & roles");
  await h.visit("/settings", "Clinic settings: modules, OPD rules, cash rules, printing and messaging.", "Clinic settings");
  await h.visit("/audit", "Audit log: who viewed or changed patient records, and when.", "Audit log");
  await h.visit("/feedback", "Patient feedback: ratings after OPD visits and discharge.", "Patient feedback");
  await h.visit("/display/devices", "Display devices: waiting-area TVs and ward kiosks.", "Display devices");
  await h.visit("/ov-staff", "Online visits: video consultations — fee, accept, prescribe.", "Online visits");
  await h.visit("/patients/merge", "Merge patients: join duplicate records into one MR.", "Merge patients");
  await h.visit("/help", "Help & guides: manuals, PDF guides and videos for every role.", "Help & guides");
  await h.hush();
}
