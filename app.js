const SUPABASE_URL = "https://dihxwbpkltjdvqzmfnmz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jrSQsPIaJui421VMa6wUbQ_Y-S8uhK4";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const modal = document.querySelector("#modal");
const title = document.querySelector("#modal-title");
const copy = document.querySelector("#modal-copy");
const form = document.querySelector("#account-form");
const message = document.querySelector("#message");
const status = document.querySelector("#status");
let mode = "login";

const el = id => document.getElementById(id);
const say = text => { message.textContent = text; };
const setVisible = (id, visible) => { el(id).hidden = !visible; };

function openModal(nextMode) {
  mode = nextMode;
  const config = {
    login: ["লগইন", "আপনার EnziLink অ্যাকাউন্টে প্রবেশ করুন।", "লগইন করুন"],
    join: ["EnziLink-এ যুক্ত হোন", "গ্রাহক বা কর্মী হিসেবে বিনামূল্যে অ্যাকাউন্ট তৈরি করুন।", "অ্যাকাউন্ট তৈরি করুন"],
    post: ["কাজ পোস্ট করুন", "কাজ পোস্ট করতে আগে লগইন করুন।", "কাজ জমা দিন"]
  }[mode];
  title.textContent = config[0];
  copy.textContent = config[1];
  el("account-submit").textContent = config[2];
  setVisible("name-field", mode === "join");
  setVisible("role-field", mode === "join");
  setVisible("email-field", mode !== "post");
  setVisible("password-field", mode !== "post");
  setVisible("job-fields", mode === "post");
  el("account-email").required = mode !== "post";
  el("account-password").required = mode !== "post";
  el("account-name").required = mode === "join";
  el("job-title").required = mode === "post";
  el("job-profession").required = mode === "post";
  el("job-area").required = mode === "post";
  el("job-description").required = mode === "post";
  say("");
  form.reset();
  modal.showModal();
}

document.querySelectorAll("[data-open]").forEach(button => {
  button.addEventListener("click", () => openModal(button.dataset.open));
});
el("close").addEventListener("click", () => modal.close());

async function ensureWorkerRole() {
  const { data: { user }, error: userError } = await db.auth.getUser();
  if (userError || !user) throw new Error("প্রথমে লগইন করুন।");
  const { data: profile, error: profileError } = await db
    .from("el_profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError) throw profileError;
  if (profile?.role !== "worker") {
    const { error } = await db.rpc("el_become_worker");
    if (error) throw error;
  }
  const { error: workerError } = await db.from("el_worker_profiles").upsert(
    { user_id: user.id, is_published: false },
    { onConflict: "user_id" }
  );
  if (workerError) throw workerError;
}

async function showSession() {
  const { data: { user } } = await db.auth.getUser();
  if (user) {
    status.textContent = "লগইন করা আছে: " + user.email;
    const pendingRole = localStorage.getItem("enzilink_requested_role");
    if (pendingRole === "worker") {
      await ensureWorkerRole();
      localStorage.removeItem("enzilink_requested_role");
      status.textContent = "কর্মী অ্যাকাউন্ট প্রস্তুত। প্রোফাইল সম্পূর্ণ করে প্রকাশ করুন।";
    }
  } else {
    status.textContent = "কর্মী খুঁজতে, কাজ পোস্ট করতে বা আবেদন করতে লগইন করুন।";
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const submit = el("account-submit");
  submit.disabled = true;
  try {
    if (mode === "login") {
      const { error } = await db.auth.signInWithPassword({
        email: el("account-email").value.trim(),
        password: el("account-password").value
      });
      if (error) throw error;
      await showSession();
      say("লগইন সফল হয়েছে।");
      setTimeout(() => modal.close(), 600);
    } else if (mode === "join") {
      const requestedRole = el("account-role").value;
      const { data, error } = await db.auth.signUp({
        email: el("account-email").value.trim(),
        password: el("account-password").value,
        options: { data: { display_name: el("account-name").value.trim() } }
      });
      if (error) throw error;
      localStorage.setItem("enzilink_requested_role", requestedRole);
      if (data.session) {
        await showSession();
        say("অ্যাকাউন্ট তৈরি হয়েছে।");
      } else {
        say("অ্যাকাউন্ট তৈরি হয়েছে। ইমেইলে পাঠানো নিশ্চিতকরণ লিংকে ক্লিক করে তারপর লগইন করুন।");
      }
    } else if (mode === "post") {
      const { data: { user }, error: authError } = await db.auth.getUser();
      if (authError || !user) throw new Error("কাজ পোস্ট করার আগে লগইন করুন।");
      const { error } = await db.from("el_service_requests").insert({
        customer_id: user.id,
        title: el("job-title").value.trim(),
        description: el("job-description").value.trim(),
        profession: el("job-profession").value.trim(),
        area: el("job-area").value.trim()
      });
      if (error) throw error;
      say("আপনার কাজের পোস্ট সফলভাবে সংরক্ষিত হয়েছে।");
      setTimeout(() => modal.close(), 900);
    }
  } catch (error) {
    say(error.message || "অনুরোধটি সম্পন্ন করা যায়নি।");
  } finally {
    submit.disabled = false;
  }
});

async function searchWorkers() {
  const profession = el("profession").value.trim().toLowerCase();
  const area = el("area").value.trim().toLowerCase();
  status.textContent = "কর্মী খোঁজা হচ্ছে…";
  try {
    const { data: workers, error } = await db.from("el_worker_profiles")
      .select("user_id,headline,bio,years_experience")
      .eq("is_published", true).limit(50);
    if (error) throw error;
    const ids = (workers || []).map(worker => worker.user_id);
    if (!ids.length) {
      status.textContent = "এখনো কোনো প্রকাশিত কর্মী প্রোফাইল পাওয়া যায়নি।";
      return;
    }
    const [profilesResult, skillsResult] = await Promise.all([
      db.from("el_profiles").select("id,display_name,area").in("id", ids),
      db.from("el_worker_skills").select("worker_id,profession,skill").in("worker_id", ids)
    ]);
    if (profilesResult.error) throw profilesResult.error;
    if (skillsResult.error) throw skillsResult.error;
    const profiles = new Map((profilesResult.data || []).map(profile => [profile.id, profile]));
    const skills = new Map();
    for (const skill of (skillsResult.data || [])) {
      if (!skills.has(skill.worker_id)) skills.set(skill.worker_id, []);
      skills.get(skill.worker_id).push(skill);
    }
    const matches = workers.filter(worker => {
      const profile = profiles.get(worker.user_id);
      const workerSkills = skills.get(worker.user_id) || [];
      const professionMatch = !profession || worker.headline?.toLowerCase().includes(profession) ||
        workerSkills.some(skill => (skill.profession + " " + (skill.skill || "")).toLowerCase().includes(profession));
      const areaMatch = !area || profile?.area?.toLowerCase().includes(area);
      return professionMatch && areaMatch;
    });
    status.textContent = matches.length
      ? matches.map(worker => {
          const profile = profiles.get(worker.user_id) || {};
          const list = (skills.get(worker.user_id) || []).map(skill => skill.profession).join(", ");
          return (profile.display_name || "EnziLink কর্মী") + " · " + (profile.area || "এলাকা উল্লেখ নেই") +
            " · " + (worker.headline || list || "দক্ষ কর্মী") +
            (worker.years_experience != null ? " · অভিজ্ঞতা: " + worker.years_experience + " বছর" : "");
        }).join("\\n")
      : "আপনার অনুসন্ধানের সঙ্গে মেলে এমন প্রকাশিত কর্মী পাওয়া যায়নি।";
  } catch (error) {
    status.textContent = "কর্মী তালিকা লোড হয়নি: " + (error.message || "Unknown error");
  }
}
el("search-form").addEventListener("submit", event => {
  event.preventDefault();
  searchWorkers();
});

document.querySelectorAll("[data-cat]").forEach(button => button.addEventListener("click", () => {
  el("profession").value = button.dataset.cat;
  el("find").scrollIntoView({ behavior: "smooth" });
  searchWorkers();
}));

el("year").textContent = new Date().getFullYear();
let installPrompt = null;
const installButton = el("install-app");
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
});
installButton.addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installButton.hidden = true;
});
window.addEventListener("appinstalled", () => { installButton.hidden = true; });
window.addEventListener("load", () => {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("./sw.js").catch(error => console.info("Offline support unavailable:", error));
  }
  showSession().catch(error => { status.textContent = error.message; });
});
