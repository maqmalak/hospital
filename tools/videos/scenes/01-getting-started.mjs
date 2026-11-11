// 01 — Signing in, the Desktop, branch, language, dark mode and the help centre.
export default async function (page, h) {
  await h.title("Signing in and finding your way", "Every staff member signs in to the same web app; the Desktop shows only the screens of their role.",
    ["Sign in", "Desktop", "Top bar", "Roles", "Help centre"]);
  await h.go("/login", 1500);
  await h.say("Open the hospital address on any counter PC, ward tablet or phone, and sign in with your work email and password.", "Step 1 · Sign in");
  await h.as("reception");
  await h.go("/pw-home", 2500);
  await h.say("The Desktop: one tile for every screen your role may open — here the reception desk.", "Step 2 · Desktop");
  await h.scroll(420, 1200); await h.scroll(-420, 600);
  await h.say("The top bar shows your branch, English / اردو, dark mode and sign out.", "Step 3 · Top bar");
  const lang = page.getByRole("button", { name: /English/ }).first();
  if (await lang.count()) await h.focus(lang, 1600);
  await h.as("doctor");
  await h.go("/pw-home", 2500);
  await h.say("A doctor signing in sees clinical screens instead: prescriptions, queue, history, wards.", "Roles");
  await h.as("lab");
  await h.go("/pw-home", 2200);
  await h.say("And the lab sees lab orders, samples, results and verification. Access per role is set by the admin on Users & roles.", "Roles");
  await h.go("/help", 2600);
  await h.say("Help & guides: the manual for your role, PDF guides and a video for every process — like this one.", "Step 5 · Help centre");
  await h.hush(); await h.pause(600);
}
