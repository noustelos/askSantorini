const answers = {
  "Best sunset spot tonight": "Oia is iconic but very crowded. Imerovigli and Firostefani are calmer alternatives with beautiful caldera views. For a premium experience, consider a sunset catamaran cruise.",
  "Catamaran sunset cruise": "A sunset catamaran cruise is one of the most popular Santorini experiences, especially for couples. It usually combines caldera views, swimming stops and sunset from the water.",
  "Best beach near me": "Perissa and Perivolos are ideal for black sand, beach bars and easy access. Kamari is practical and family-friendly. Red Beach is unique but often crowded.",
  "How to get to Oia": "From Fira, you can reach Oia by bus, taxi, private transfer or rental car. Buses are the budget option, but schedules may vary in high season.",
  "Santorini in one day": "Focus on Fira, Oia, one beach, and one sunset spot. If you want less stress, choose either a caldera walk or a guided tour instead of trying to see everything.",
  "What to do if it's windy": "Choose sheltered villages, museums, wine tasting, Akrotiri archaeological site, local food, or caldera-view cafes. Boat tours may depend on sea conditions.",
  "Best local food": "Try fava, tomato fritters, white eggplant, fresh seafood, local wines and traditional tavern dishes. Ask for simple local recommendations, not only famous-view restaurants.",
  "Family-friendly ideas": "Kamari beach, Perissa beach, easy boat trips, short village walks, ice cream stops and calm sunset viewpoints usually work well for families."
};

const preview = document.querySelector("#answer-preview");
const previewQuestion = document.querySelector("#preview-question");
const previewAnswer = document.querySelector("#preview-answer");
const questionCards = document.querySelectorAll(".question-card");
const notifyForm = document.querySelector("#notify-form");
const modalButtons = document.querySelectorAll("[data-modal]");
const closeButtons = document.querySelectorAll("[data-close]");

questionCards.forEach((card) => {
  card.addEventListener("click", () => {
    const question = card.dataset.question;
    const answer = answers[question];

    questionCards.forEach((item) => item.classList.remove("is-active"));
    card.classList.add("is-active");

    previewQuestion.textContent = question;
    previewAnswer.textContent = answer;
    preview.hidden = false;
    preview.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
});

if (notifyForm) {
  notifyForm.addEventListener("submit", (event) => {
    event.preventDefault();
    alert("Thanks. Email collection will be enabled soon. Please contact hello@asksantorini.ai.");
  });
}

modalButtons.forEach((button) => {
  button.addEventListener("click", () => {
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

    modal.close();
    document.body.classList.remove("modal-open");
  });
});

document.querySelectorAll("dialog").forEach((modal) => {
  modal.addEventListener("close", () => {
    document.body.classList.remove("modal-open");
  });
});