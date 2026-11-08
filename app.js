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
  setVisible("resend-confirmation", mode === "login");
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

el("resend-confirmation").addEventListener("click", async () => {
  const email = el("account-email").value.trim();
  if (!email) { say("আগে আপনার নিবন্ধিত Gmail ঠিকানাটি লিখুন।"); return; }
  const button = el("resend-confirmation");
  button.disabled = true;
  try {
    const { error } = await db.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: "https://almuntasir0011-alt.github.io/EnziLink/" }
    });
    if (error) throw error;
    say("নিশ্চিতকরণ ইমেইল পাঠানোর অনুরোধ করা হয়েছে। Gmail-এর Inbox ও Spam ফোল্ডার দেখুন।");
  } catch (error) {
    say(error.message || "ইমেইল পাঠানো যায়নি।");
  } finally {
    button.disabled = false;
  }
});

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
        options: {
          data: { display_name: el("account-name").value.trim() },
          emailRedirectTo: "https://almuntasir0011-alt.github.io/EnziLink/"
        }
      });
      if (error) throw error;
      localStorage.setItem("enzilink_requested_role", requestedRole);
      if (data.session) {
        await showSession();
        say("অ্যাকাউন্ট তৈরি হয়েছে।");
      } else {
        setVisible("resend-confirmation", true);
        say("অ্যাকাউন্ট তৈরি হয়েছে। ইমেইল না পেলে নিচের বাটনে নিশ্চিতকরণ ইমেইল আবার পাঠান। Gmail-এর Spam ও Promotions ফোল্ডারও দেখুন।");
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

let selectedWorkerId = null;

function renderWorkerCards(workers, profiles, skills) {
  const container = el("worker-results");
  container.replaceChildren();
  workers.forEach(worker => {
    const profile = profiles.get(worker.user_id) || {};
    const workerSkills = skills.get(worker.user_id) || [];
    const card = document.createElement("article");
    card.className = "worker-card";
    const name = document.createElement("h3");
    name.textContent = profile.display_name || "EnziLink কর্মী";
    const headline = document.createElement("p");
    headline.className = "worker-headline";
    headline.textContent = worker.headline || "দক্ষ কর্মী";
    const meta = document.createElement("p");
    meta.className = "worker-meta";
    meta.textContent = (profile.area || "এলাকা উল্লেখ নেই") + " · অভিজ্ঞতা: " +
      (worker.years_experience ?? "উল্লেখ নেই") + (worker.years_experience == null ? "" : " বছর");
    const bio = document.createElement("p");
    bio.className = "worker-bio";
    bio.textContent = worker.bio || "এই কর্মী এখনো পরিচিতি যোগ করেননি।";
    const skillLine = document.createElement("p");
    skillLine.className = "worker-skills";
    skillLine.textContent = "দক্ষতা: " + (workerSkills.map(s => s.skill || s.profession).filter(Boolean).join(", ") || "তথ্য যোগ করা হয়নি");
    const verified = document.createElement("span");
    verified.className = "worker-verification";
    verified.textContent = worker.verification_status === "verified" ? "✓ যাচাইকৃত" : "যাচাই হয়নি";
    const contact = document.createElement("button");
    contact.type = "button";
    contact.className = "primary worker-contact";
    contact.textContent = "বার্তা পাঠান";
    contact.addEventListener("click", () => openWorkerContact(worker.user_id, name.textContent, headline.textContent));
    card.append(name, headline, meta, bio, skillLine, verified, contact);
    container.append(card);
  });
}

async function openWorkerContact(workerId, workerName, headline) {
  selectedWorkerId = workerId;
  el("contact-title").textContent = workerName;
  el("contact-copy").textContent = headline + " — আপনার কাজের প্রয়োজনটি লিখে পাঠান।";
  el("contact-body").value = "";
  el("contact-message").textContent = "";
  el("contact-dialog").showModal();
}

el("contact-close").addEventListener("click", () => el("contact-dialog").close());
el("contact-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = el("contact-send");
  button.disabled = true;
  el("contact-message").textContent = "বার্তা পাঠানো হচ্ছে…";
  try {
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) throw new Error("বার্তা পাঠাতে আগে Customer Account দিয়ে লগইন করুন।");
    if (user.id === selectedWorkerId) throw new Error("নিজের প্রোফাইলে বার্তা পাঠানো যাবে না।");
    const { data: profile, error: pError } = await db.from("el_profiles")
      .select("role").eq("id", user.id).single();
    if (pError) throw pError;
    if (profile.role !== "customer") throw new Error("কর্মী প্রোফাইল থেকে যোগাযোগ করতে Customer Account ব্যবহার করুন।");
    let { data: conversation, error: cError } = await db.from("el_conversations")
      .select("id").eq("customer_id", user.id).eq("worker_id", selectedWorkerId)
      .is("request_id", null).maybeSingle();
    if (cError) throw cError;
    if (!conversation) {
      const created = await db.from("el_conversations").insert({
        customer_id: user.id, worker_id: selectedWorkerId, request_id: null
      }).select("id").single();
      if (created.error) throw created.error;
      conversation = created.data;
    }
    const { error: mError } = await db.from("el_messages").insert({
      conversation_id: conversation.id, sender_id: user.id,
      body: el("contact-body").value.trim()
    });
    if (mError) throw mError;
    el("contact-message").textContent = "বার্তা পাঠানো হয়েছে। কর্মী তার EnziLink অ্যাকাউন্টে এটি দেখতে পারবেন।";
    el("contact-body").value = "";
  } catch (error) {
    el("contact-message").textContent = error.message || "বার্তা পাঠানো যায়নি।";
  } finally {
    button.disabled = false;
  }
});

async function searchWorkers() {
  const profession = el("profession").value.trim().toLowerCase();
  const area = el("area").value.trim().toLowerCase();
  status.textContent = "কর্মী খোঁজা হচ্ছে…";
  el("worker-results").replaceChildren();
  try {
    const { data: workers, error } = await db.from("el_worker_profiles")
      .select("user_id,headline,bio,years_experience,is_published,verification_status")
      .eq("is_published", true).limit(100);
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
      const profile = profiles.get(worker.user_id) || {};
      const workerSkills = skills.get(worker.user_id) || [];
      const professionMatch = !profession || worker.headline?.toLowerCase().includes(profession) ||
        workerSkills.some(skill => (skill.profession + " " + (skill.skill || "")).toLowerCase().includes(profession));
      const areaMatch = !area || profile.area?.toLowerCase().includes(area);
      return professionMatch && areaMatch;
    });
    if (!matches.length) {
      status.textContent = "আপনার অনুসন্ধানের সঙ্গে মেলে এমন প্রকাশিত কর্মী পাওয়া যায়নি।";
      return;
    }
    status.textContent = matches.length + " জন প্রকাশিত কর্মী পাওয়া গেছে।";
    renderWorkerCards(matches, profiles, skills);
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


// Worker profile setup: uses the existing authenticated EnziLink account.
const profileDialog = el("profile-dialog");
const profileMessage = el("profile-message");
el("profile-open").addEventListener("click", async () => {
  // Open the dialog immediately so a slow auth/network check cannot make the
  // profile button appear unresponsive.
  profileDialog.showModal();
  profileMessage.textContent = "অ্যাকাউন্ট যাচাই করা হচ্ছে…";
  try {
    const { data: { user }, error } = await db.auth.getUser();
    if (error) throw error;
    if (!user) {
      profileDialog.close();
      openModal("login");
      say("প্রোফাইল তৈরি করতে আগে লগইন করুন।");
      return;
    }
    profileMessage.textContent = "প্রোফাইলের তথ্য লোড হচ্ছে…";
    const { data: profile, error: pError } = await db.from("el_profiles")
      .select("display_name,role,area").eq("id", user.id).single();
    if (pError) throw pError;
    if (profile.role === "customer") {
      const { error: roleError } = await db.rpc("el_become_worker");
      if (roleError) throw roleError;
    } else if (profile.role !== "worker") {
      throw new Error("এই অ্যাকাউন্টে কর্মী প্রোফাইল তৈরি করা যাবে না।");
    }
    const { data: worker, error: wError } = await db.from("el_worker_profiles")
      .select("headline,bio,years_experience,is_published").eq("user_id", user.id).maybeSingle();
    if (wError) throw wError;
    const { data: skills, error: sError } = await db.from("el_worker_skills")
      .select("profession,skill").eq("worker_id", user.id);
    if (sError) throw sError;
    el("profile-name").value = profile.display_name || user.user_metadata?.display_name || "";
    el("profile-area").value = profile.area || "";
    el("profile-headline").value = worker?.headline || "";
    el("profile-experience").value = worker?.years_experience ?? "";
    el("profile-skills").value = (skills || []).map(x => x.skill ? x.profession + ": " + x.skill : x.profession).join(", ");
    el("profile-bio").value = worker?.bio || "";
    el("profile-publish").checked = worker?.is_published || false;
    profileMessage.textContent = "তথ্য পূরণ করে সংরক্ষণ করুন।";
  } catch (error) {
    profileMessage.textContent = error.message || "প্রোফাইল লোড করা যায়নি।";
  }
});
el("profile-close").addEventListener("click", () => profileDialog.close());
el("worker-profile-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = el("profile-save");
  button.disabled = true;
  profileMessage.textContent = "সংরক্ষণ হচ্ছে…";
  try {
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) throw new Error("সেশন শেষ হয়েছে। আবার লগইন করুন।");
    const name = el("profile-name").value.trim();
    const area = el("profile-area").value.trim();
    const headline = el("profile-headline").value.trim();
    const experience = Number(el("profile-experience").value);
    const bio = el("profile-bio").value.trim();
    const published = el("profile-publish").checked;
    const skillItems = el("profile-skills").value.split(",").map(s => s.trim()).filter(Boolean);
    if (!skillItems.length) throw new Error("অন্তত একটি দক্ষতা লিখুন।");
    const { error: pError } = await db.from("el_profiles")
      .update({ display_name: name, area, updated_at: new Date().toISOString() }).eq("id", user.id);
    if (pError) throw pError;
    const { error: wError } = await db.from("el_worker_profiles").upsert({
      user_id: user.id, headline, bio, years_experience: experience,
      is_published: published, updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (wError) throw wError;
    const { error: dError } = await db.from("el_worker_skills").delete().eq("worker_id", user.id);
    if (dError) throw dError;
    const { error: sError } = await db.from("el_worker_skills").insert(
      skillItems.map(item => ({ worker_id: user.id, profession: headline, skill: item }))
    );
    if (sError) throw sError;
    profileMessage.textContent = published
      ? "প্রোফাইল সংরক্ষিত এবং প্রকাশিত হয়েছে।"
      : "প্রোফাইল সংরক্ষিত হয়েছে। এটি এখনো প্রকাশিত নয়।";
    status.textContent = published ? "আপনার কর্মী প্রোফাইল প্রকাশিত হয়েছে।" : "আপনার কর্মী প্রোফাইল সংরক্ষিত হয়েছে।";
  } catch (error) {
    profileMessage.textContent = error.message || "প্রোফাইল সংরক্ষণ করা যায়নি।";
  } finally {
    button.disabled = false;
  }
});
