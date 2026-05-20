const answers = {
  "Best sunset spot tonight": `Oia is iconic but very crowded. Imerovigli and Firostefani are calmer alternatives with beautiful caldera views. For a premium experience, consider a sunset catamaran cruise.`,
  "Catamaran sunset cruise": `A sunset catamaran cruise is one of the most popular Santorini experiences, especially for couples. It usually combines caldera views, swimming stops and sunset from the water.`,
  "Best beach near me": `Perissa and Perivolos are ideal for black sand, beach bars and easy access. Kamari is practical and family-friendly. Red Beach is unique but often crowded.`,
  "How to get to Oia": `From Fira, you can reach Oia by bus, taxi, private transfer or rental car. Buses are the budget option, but schedules may vary in high season.`,
  "Santorini in one day": `Focus on Fira, Oia, one beach, and one sunset spot. If you want less stress, choose either a caldera walk or a guided tour instead of trying to see everything.`,
  "What to do if it's windy": `Choose sheltered villages, museums, wine tasting, Akrotiri archaeological site, local food, or caldera-view cafes. Boat tours may depend on sea conditions.`,
  "Best local food": `Try fava, tomato fritters, white eggplant, fresh seafood, local wines and traditional tavern dishes. Ask for simple local recommendations, not only famous-view restaurants.`,
  "Family-friendly ideas": `Kamari beach, Perissa beach, easy boat trips, short village walks, ice cream stops and calm sunset viewpoints usually work well for families.`
};

const preview = document.querySelector("#answer-preview");
const previewQuestion = document.querySelector("#preview-question");
const previewAnswer = document.querySelector("#preview-answer");
const questionCards = document.querySelectorAll(".question-card");
const notifyForm = document.querySelector("#notify-form");
const modalButtons = document.querySelectorAll("[data-modal]");
const closeButtons = document.querySelectorAll("[data-close]");
const siteHeader = document.querySelector(".site-header");
const menuToggle = document.querySelector(".menu-toggle");
const siteNav = document.querySelector(".site-nav");
const currentYear = document.querySelector("#current-year");
const formStatus = document.querySelector("#form-status");
const cookieBanner = document.querySelector("#cookie-banner");
const acceptCookies = document.querySelector("#accept-cookies");
const essentialCookies = document.querySelector("#essential-cookies");
const cookieStorageKey = "askSantoriniCookiePreference";

if (currentYear) {
  currentYear.textContent = String(new Date().getFullYear());
}

const getCookiePreference = () => {
  try {
    return window.localStorage.getItem(cookieStorageKey);
  } catch {
    return null;
  }
};

const setCookiePreference = (value) => {
  try {
    window.localStorage.setItem(cookieStorageKey, value);
  } catch {
    return;
  }
};

const hideCookieBanner = () => {
  if (!cookieBanner) {
    return;
  }

  cookieBanner.classList.add("is-hidden");
};

if (cookieBanner && !getCookiePreference()) {
  cookieBanner.classList.remove("is-hidden");
}

acceptCookies?.addEventListener("click", () => {
  setCookiePreference("all");
  hideCookieBanner();
});

essentialCookies?.addEventListener("click", () => {
  setCookiePreference("necessary");
  hideCookieBanner();
});

const closeMenu = () => {
  if (!siteHeader || !menuToggle) {
    return;
  }

  siteHeader.classList.remove("is-menu-open");
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Open menu");
};

if (menuToggle && siteHeader && siteNav) {
  menuToggle.addEventListener("click", () => {
    const isOpen = siteHeader.classList.toggle("is-menu-open");

    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  });

  siteNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });
}

document.querySelectorAll('a[href="#top"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    closeMenu();

    window.scrollTo({ top: 0, behavior: "smooth" });

    if (window.location.hash !== "#top") {
      window.history.pushState(null, "", "#top");
    }
  });
});

const showAnswerPreview = (card, shouldScroll = true) => {
  if (!preview || !previewQuestion || !previewAnswer) {
    return;
  }

  const question = card.dataset.question;
  const answer = answers[question];

  if (!question || !answer) {
    return;
  }

  questionCards.forEach((item) => {
    item.classList.remove("is-active");
    item.setAttribute("aria-pressed", "false");
  });

  card.classList.add("is-active");
  card.setAttribute("aria-pressed", "true");

  previewQuestion.textContent = question;
  previewAnswer.textContent = answer;

  if (shouldScroll) {
    preview.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
};

questionCards.forEach((card, index) => {
  card.setAttribute("aria-pressed", "false");

  card.addEventListener("click", () => {
    showAnswerPreview(card);
  });

  if (index === 0) {
    showAnswerPreview(card, false);
  }
});

if (notifyForm) {
  const emailInput = notifyForm.querySelector("#email");

  emailInput?.addEventListener("input", () => {
    emailInput.setAttribute("aria-invalid", "false");

    if (formStatus) {
      formStatus.textContent = "";
    }
  });

  notifyForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(notifyForm);
    const email = String(formData.get("email") || "").trim();
    const honeypot = String(formData.get("company") || "").trim();

    if (honeypot) {
      return;
    }

    if (!emailInput || !emailInput.checkValidity()) {
      emailInput?.setAttribute("aria-invalid", "true");

      if (formStatus) {
        formStatus.textContent = "Enter a valid email address.";
      }

      emailInput?.focus();
      return;
    }

    emailInput.setAttribute("aria-invalid", "false");

    if (formStatus) {
      formStatus.textContent = "Opening your email app to request early access.";
    }

    const subject = encodeURIComponent("AskSantorini.ai Early Access");
    const body = encodeURIComponent(`Please add me to the AskSantorini.ai early access list.\n\nEmail: ${email}`);

    window.location.href = `mailto:hello@asksantorini.ai?subject=${subject}&body=${body}`;
  });
}

modalButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();

    const modal = document.getElementById(button.dataset.modal);

    if (!modal) {
      return;
    }

    if (typeof modal.showModal === "function") {
      modal.showModal();
      document.body.classList.add("modal-open");
      return;
    }

    modal.setAttribute("open", "");
    document.body.classList.add("modal-open");
  });
});

closeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const modal = button.closest("dialog");

    if (!modal) {
      return;
    }

    if (typeof modal.close === "function") {
      modal.close();
    } else {
      modal.removeAttribute("open");
    }

    document.body.classList.remove("modal-open");
  });
});

document.querySelectorAll("dialog").forEach((modal) => {
  modal.addEventListener("close", () => {
    document.body.classList.remove("modal-open");
  });
});
