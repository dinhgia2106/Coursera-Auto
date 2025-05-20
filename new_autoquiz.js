(async function () {
  console.log("🚀 Bắt đầu tự động duyệt module và quiz...");

  // API configuration - REPLACE WITH YOUR OWN API KEY
  const API_KEY = "key_here";
  const API_URL =
    "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent";

  // Storage key for incorrect answers
  const STORAGE_KEY = "quiz_incorrect_answers";

  // --- Basic Utility Functions ---
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // --- Answer Storage Management ---
  function getIncorrectAnswers() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.error("Error retrieving incorrect answers from storage:", error);
      return {};
    }
  }

  function saveIncorrectAnswers(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error("Error saving incorrect answers to storage:", error);
    }
  }

  function addIncorrectAnswer(questionText, incorrectAnswerText) {
    const data = getIncorrectAnswers();
    if (!data[questionText]) {
      data[questionText] = [];
    }
    if (!data[questionText].includes(incorrectAnswerText)) {
      data[questionText].push(incorrectAnswerText);
    }
    saveIncorrectAnswers(data);
    console.log(
      `Added incorrect answer: "${questionText}": "${incorrectAnswerText}"`
    );
  }

  function isKnownIncorrectAnswer(questionText, answerText) {
    const data = getIncorrectAnswers();
    return (
      data[questionText] &&
      data[questionText].some(
        (incorrect) =>
          normalizeText(incorrect).includes(normalizeText(answerText)) ||
          normalizeText(answerText).includes(normalizeText(incorrect))
      )
    );
  }

  // --- Helper Functions ---
  function normalizeText(text) {
    return text?.replace(/\s+/g, " ").trim().toLowerCase() || "";
  }

  function levenshtein(a, b) {
    const m = a.length,
      n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const matrix = [];

    for (let i = 0; i <= n; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= m; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[n][m];
  }

  function detectRequiredSelections(questionText) {
    const selectMatch = questionText.match(/select\s+(\w+)/i);
    const chooseMatch = questionText.match(/choose\s+(\w+)/i);

    if (selectMatch || chooseMatch) {
      const match = selectMatch || chooseMatch;
      const numWord = match[1].toLowerCase();

      const wordToNumber = {
        one: 1,
        two: 2,
        three: 3,
        four: 4,
        five: 5,
        six: 6,
        seven: 7,
        eight: 8,
        nine: 9,
        ten: 10,
      };

      if (wordToNumber[numWord]) {
        return wordToNumber[numWord];
      } else if (!isNaN(parseInt(numWord))) {
        return parseInt(numWord);
      }
    }
    return 1;
  }

  function getOptionLabel(optionIndex) {
    const labels = ["A", "B", "C", "D", "E", "F", "G", "H"];
    return labels[optionIndex] || "";
  }

  function getOptionText(optionElement) {
    const textContainer = optionElement.querySelector(
      ".rc-CML [data-testid='cml-viewer']"
    );
    return textContainer ? textContainer.textContent.trim() : "";
  }

  function parseMultipleAnswers(answer) {
    const answerLetters = answer.match(/[A-H]/g) || [];

    if (answerLetters.length === 0) {
      const lines = answer.split(/[\n,;.]/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0 && /^[A-H]/i.test(trimmed)) {
          answerLetters.push(trimmed[0].toUpperCase());
        }
      }
    }

    return [...new Set(answerLetters)];
  }

  // --- API Integration ---
  async function getAnswerFromGemini(
    questionText,
    optionTexts = [],
    incorrectOptions = [],
    isCheckbox = false
  ) {
    try {
      console.log("Querying API for:", questionText);

      const requiredSelections = isCheckbox
        ? detectRequiredSelections(questionText)
        : 1;

      let prompt = `Đây là một câu hỏi ${
        isCheckbox ? "nhiều lựa chọn" : "trắc nghiệm"
      }: ${questionText}\n\n`;

      if (optionTexts.length > 0) {
        prompt += "Các lựa chọn:\n";

        optionTexts.forEach((option, index) => {
          const isIncorrect = incorrectOptions.includes(index);
          prompt += `${option}${
            isIncorrect ? " (Đã biết là sai từ lần thử trước)" : ""
          }\n`;
        });

        if (isCheckbox) {
          prompt += `\nHãy chọn ${requiredSelections} đáp án đúng nhất. `;
          if (incorrectOptions.length > 0) {
            prompt +=
              "TRÁNH chọn các đáp án đã được đánh dấu là sai từ lần thử trước. ";
          }
          prompt +=
            "Chỉ trả lời các chữ cái tương ứng với đáp án (ví dụ: A, C). Liệt kê bằng dấu phẩy nếu có nhiều đáp án. Không giải thích.";
        } else {
          prompt +=
            "\nHãy trả lời câu hỏi này bằng cách chỉ đưa ra đáp án đúng ";
          if (incorrectOptions.length > 0) {
            prompt +=
              "(TRÁNH chọn các đáp án đã được đánh dấu là sai từ lần thử trước). ";
          }
          prompt +=
            "Chỉ đưa ra chữ cái nếu là đáp án A, B, C, D... hoặc đưa ra nội dung đáp án đúng. Không giải thích.";
        }
      } else {
        prompt +=
          "Hãy trả lời câu hỏi này. Chỉ đưa ra đáp án, không giải thích.";
      }

      console.log("Prompt sent to API:", prompt);

      const response = await fetch(`${API_URL}?key=${API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          },
        }),
      });

      const data = await response.json();

      if (data.error) {
        console.error("API error:", data.error);
        return null;
      }

      const answer = data.candidates[0].content.parts[0].text.trim();
      console.log("API response:", answer);
      return answer;
    } catch (error) {
      console.error("Error calling API:", error);
      return null;
    }
  }

  // --- Question Processing Functions ---
  async function processMCQQuestions() {
    const questionContainers = document.querySelectorAll(
      '[data-testid="part-Submission_MultipleChoiceQuestion"]'
    );

    console.log(`Found ${questionContainers.length} MCQ questions`);

    for (const container of questionContainers) {
      const promptElement = container.querySelector(
        'div[id^="prompt-autoGradableResponseId"]'
      );
      if (!promptElement) continue;

      const questionText = promptElement.textContent.trim();
      console.log("Processing MCQ question:", questionText);

      const optionsContainer = container.querySelector('[role="radiogroup"]');
      if (!optionsContainer) {
        console.warn("Container for options not found:", questionText);
        continue;
      }

      const optionElements = Array.from(
        optionsContainer.querySelectorAll(".rc-Option")
      );

      if (!optionElements.length) {
        console.warn("No options found for question:", questionText);
        continue;
      }

      const alreadySelected = optionElements.some((option) =>
        option.querySelector('input[type="radio"]:checked')
      );

      if (alreadySelected) {
        console.log("Question already answered, skipping:", questionText);
        continue;
      }

      const optionTexts = optionElements.map((option, index) => {
        const text = getOptionText(option);
        const label = getOptionLabel(index);
        return `${label}. ${text}`;
      });

      const incorrectOptionIndices = [];
      optionElements.forEach((option, index) => {
        const optionText = getOptionText(option);
        if (isKnownIncorrectAnswer(questionText, optionText)) {
          incorrectOptionIndices.push(index);
          console.log(
            `Option ${getOptionLabel(index)} is known incorrect:`,
            optionText
          );
        }
      });

      const answer = await getAnswerFromGemini(
        questionText,
        optionTexts,
        incorrectOptionIndices,
        false
      );

      if (!answer) {
        console.warn("No answer received from API:", questionText);
        continue;
      }

      const letterMatch = answer.match(/^([A-Z])(\.|$)/);
      if (letterMatch) {
        const letter = letterMatch[1];
        const letterIndex = letter.charCodeAt(0) - "A".charCodeAt(0);

        if (letterIndex >= 0 && letterIndex < optionElements.length) {
          const optionToSelect = optionElements[letterIndex];
          const optionText = getOptionText(optionToSelect);

          if (isKnownIncorrectAnswer(questionText, optionText)) {
            console.warn(
              `API suggested option ${letter} but it's known incorrect:`,
              optionText
            );

            const availableOptions = optionElements.filter(
              (_, index) => !incorrectOptionIndices.includes(index)
            );

            if (availableOptions.length > 0) {
              const fallbackOption = availableOptions[0];
              const input = fallbackOption.querySelector("input");
              if (input && !input.checked) {
                input.click();
                console.log(
                  `Selected fallback option:`,
                  getOptionText(fallbackOption)
                );
              }
            }
          } else {
            const input = optionToSelect.querySelector("input");
            if (input && !input.checked) {
              input.click();
              console.log(`Clicked option ${letter}:`, optionText);
            }
          }
        }
      } else {
        let bestOption = null;
        let bestOptionIndex = -1;
        let bestOptionDistance = Infinity;

        optionElements.forEach((option, index) => {
          const optionText = getOptionText(option);

          if (isKnownIncorrectAnswer(questionText, optionText)) {
            console.log(`Skipping known incorrect option:`, optionText);
            return;
          }

          const distance = levenshtein(
            normalizeText(optionText),
            normalizeText(answer)
          );

          console.log(
            "Comparing option:",
            optionText,
            "with",
            answer,
            "-> distance:",
            distance
          );

          if (distance < bestOptionDistance) {
            bestOptionDistance = distance;
            bestOption = option;
            bestOptionIndex = index;
          }
        });

        if (bestOption) {
          const input = bestOption.querySelector("input");
          if (input && !input.checked) {
            input.click();
            console.log(
              `Clicked option ${getOptionLabel(bestOptionIndex)}:`,
              getOptionText(bestOption)
            );
          }
        } else {
          const safeOptions = optionElements.filter(
            (_, index) => !incorrectOptionIndices.includes(index)
          );
          if (safeOptions.length > 0) {
            const fallbackOption = safeOptions[0];
            const input = fallbackOption.querySelector("input");
            if (input && !input.checked) {
              input.click();
              console.log(
                "Selected first safe option:",
                getOptionText(fallbackOption)
              );
            }
          }
        }
      }
    }
  }

  async function processCheckboxQuestions() {
    const questionContainers = document.querySelectorAll(
      '[data-testid="part-Submission_CheckboxQuestion"]'
    );

    console.log(`Found ${questionContainers.length} checkbox questions`);

    for (const container of questionContainers) {
      const promptElement = container.querySelector(
        'div[id^="prompt-autoGradableResponseId"]'
      );
      if (!promptElement) continue;

      const questionText = promptElement.textContent.trim();
      console.log("Processing checkbox question:", questionText);

      const optionsContainer = container.querySelector('[role="group"]');
      if (!optionsContainer) {
        console.warn("Container for options not found:", questionText);
        continue;
      }

      const optionElements = Array.from(
        container.querySelectorAll(".rc-Option")
      );

      if (!optionElements.length) {
        console.warn("No options found for question:", questionText);
        continue;
      }

      const selectedCount = optionElements.filter((option) =>
        option.querySelector('input[type="checkbox"]:checked')
      ).length;

      const requiredSelections = detectRequiredSelections(questionText);

      if (selectedCount >= requiredSelections) {
        console.log(
          `Question already has ${selectedCount}/${requiredSelections} selections:`,
          questionText
        );
        continue;
      }

      const optionTexts = optionElements.map((option, index) => {
        const text = getOptionText(option);
        const label = getOptionLabel(index);
        return `${label}. ${text}`;
      });

      const incorrectOptionIndices = [];
      optionElements.forEach((option, index) => {
        const optionText = getOptionText(option);
        if (isKnownIncorrectAnswer(questionText, optionText)) {
          incorrectOptionIndices.push(index);
          console.log(
            `Option ${getOptionLabel(index)} is known incorrect:`,
            optionText
          );
        }
      });

      const answer = await getAnswerFromGemini(
        questionText,
        optionTexts,
        incorrectOptionIndices,
        true
      );

      if (!answer) {
        console.warn("No answer received from API:", questionText);
        continue;
      }

      const selectedLetters = parseMultipleAnswers(answer);
      console.log(`Selected options: ${selectedLetters.join(", ")}`);

      if (selectedLetters.length === 0) {
        console.warn(
          "Couldn't parse any option letters from API response:",
          answer
        );
        continue;
      }

      // Clear current selections
      optionElements.forEach((option) => {
        const checkbox = option.querySelector('input[type="checkbox"]:checked');
        if (checkbox) {
          checkbox.click();
          console.log("Unselected option:", getOptionText(option));
        }
      });

      // Select options based on API answer
      let selectionCount = 0;

      for (const letter of selectedLetters) {
        if (selectionCount >= requiredSelections) break;

        const letterIndex = letter.charCodeAt(0) - "A".charCodeAt(0);

        if (letterIndex >= 0 && letterIndex < optionElements.length) {
          const optionToSelect = optionElements[letterIndex];
          const optionText = getOptionText(optionToSelect);

          if (isKnownIncorrectAnswer(questionText, optionText)) {
            console.warn(
              `API suggested option ${letter} but it's known incorrect:`,
              optionText
            );
            continue;
          }

          const input = optionToSelect.querySelector("input[type='checkbox']");
          if (input && !input.checked) {
            input.click();
            console.log(`Selected option ${letter}:`, optionText);
            selectionCount++;
          }
        }
      }

      // If not enough selections, pick additional safe options
      if (selectionCount < requiredSelections) {
        const safeOptions = optionElements.filter((option, index) => {
          if (incorrectOptionIndices.includes(index)) return false;

          const letter = getOptionLabel(index);
          if (selectedLetters.includes(letter)) return false;

          const input = option.querySelector("input[type='checkbox']");
          return input && !input.checked;
        });

        for (const option of safeOptions) {
          if (selectionCount >= requiredSelections) break;

          const input = option.querySelector("input[type='checkbox']");
          if (input && !input.checked) {
            input.click();
            console.log(
              `Selected additional safe option:`,
              getOptionText(option)
            );
            selectionCount++;
          }
        }
      }

      console.log(
        `Selected ${selectionCount}/${requiredSelections} options for question.`
      );
    }
  }

  async function processInputQuestion(selector) {
    const containers = document.querySelectorAll(selector);

    console.log(
      `Found ${containers.length} input questions of type ${selector}`
    );

    for (const container of containers) {
      const prompt = container.querySelector(
        '[id^="prompt-autoGradableResponseId"]'
      );
      if (!prompt) continue;

      const questionText = prompt.textContent.trim();
      console.log("Processing input question:", questionText);

      const inputElement = container.querySelector(
        'input[type="text"], input[type="number"]'
      );

      if (!inputElement) {
        console.warn("No input field found:", questionText);
        continue;
      }

      if (inputElement.value.trim()) {
        console.log("Input already has value, skipping:", questionText);
        continue;
      }

      const answer = await getAnswerFromGemini(questionText);

      if (!answer) {
        console.warn("No answer received from API:", questionText);
        continue;
      }

      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      nativeInputValueSetter.call(inputElement, answer);
      inputElement.dispatchEvent(new Event("input", { bubbles: true }));
      inputElement.dispatchEvent(new Event("change", { bubbles: true }));
      console.log("Filled input with:", answer);
    }
  }

  // --- Result Processing ---
  function collectIncorrectAnswersFromResults() {
    const evaluatedQuestions = document.querySelectorAll(
      '[data-testid^="part-Submission_"][data-testid$="Question"]'
    );
    let collected = false;

    evaluatedQuestions.forEach((question) => {
      const promptElement = question.querySelector(
        '[id^="prompt-autoGradableElementId"], [id^="prompt-autoGradableResponseId"]'
      );
      if (!promptElement) return;

      const questionText = promptElement.textContent.trim();

      if (
        question.getAttribute("data-testid").includes("MultipleChoiceQuestion")
      ) {
        const options = question.querySelectorAll(".rc-Option");
        options.forEach((option) => {
          const isChecked = option.querySelector('input[type="radio"]:checked');
          const isCorrect = option.parentElement.querySelector(".css-1ucwtwj"); // Correct icon
          const isIncorrect = option.parentElement.querySelector(".css-pn7qkz"); // Incorrect icon

          const answerText = getOptionText(option);

          if (isChecked && !isCorrect) {
            addIncorrectAnswer(questionText, answerText);
            collected = true;
          }
        });
      } else if (
        question.getAttribute("data-testid").includes("CheckboxQuestion")
      ) {
        const options = question.querySelectorAll(".rc-Option");
        options.forEach((option) => {
          const isChecked = option.querySelector(
            'input[type="checkbox"]:checked'
          );

          const optionContainer = option.closest(".css-18k2uoc");
          const optionId = optionContainer
            ? optionContainer.getAttribute("data-testid")
            : null;
          const isIncorrect = question.querySelector(
            `.css-pn7qkz[data-for="${optionId}"]`
          );

          const answerText = getOptionText(option);

          if (isChecked && isIncorrect) {
            addIncorrectAnswer(questionText, answerText);
            collected = true;
          }
        });
      }
    });

    return collected;
  }

  function checkAndRetryQuiz() {
    const gradeElement = document.querySelector(".css-14nrrh0");
    if (!gradeElement) return false;

    const gradeText = gradeElement.textContent.trim();
    const gradePercentage = parseInt(gradeText.replace("%", ""), 10);

    console.log(`Current grade: ${gradePercentage}%`);

    if (gradePercentage < 70) {
      console.log("Quiz not passed. Need to retry.");

      collectIncorrectAnswersFromResults();

      const retryButton = document.querySelector(
        '[data-testid="CoverPageActionButton"]'
      );
      if (retryButton) {
        console.log("Clicking retry button...");
        retryButton.click();

        setTimeout(() => {
          const continueButton = document.querySelector(
            '[data-testid="StartAttemptModal__primary-button"]'
          );
          if (continueButton) {
            continueButton.click();
          }
        }, 1000);

        return true;
      }
    } else {
      console.log("Quiz passed. No need to retry.");
    }

    return false;
  }

  // --- Button Handling ---
  function forceClickSubmitButton() {
    console.log("Looking for submit buttons...");
    const allButtons = document.querySelectorAll("button");

    console.log(`Found ${allButtons.length} buttons on page:`);
    allButtons.forEach((btn) => {
      const text = btn.textContent.trim();
      const disabled = btn.disabled;
      const classes = btn.className;
      const testid = btn.getAttribute("data-testid");
      console.log(
        `Button: "${text}" | Disabled: ${disabled} | TestID: ${testid} | Classes: ${classes}`
      );
    });

    // Try direct submit buttons
    for (const button of allButtons) {
      if (
        button.textContent.includes("Submit") ||
        button.getAttribute("aria-label") === "Submit" ||
        button.getAttribute("data-testid") === "submit-button"
      ) {
        const isDisabled =
          button.disabled ||
          button.getAttribute("aria-disabled") === "true" ||
          button.classList.contains("cds-button-disabled");

        console.log("Found potential submit button:", {
          text: button.textContent.trim(),
          "data-testid": button.getAttribute("data-testid"),
          "aria-label": button.getAttribute("aria-label"),
          disabled: isDisabled,
        });

        if (!isDisabled) {
          console.log("Clicking valid submit button...");
          try {
            // Standard click
            button.click();
            console.log("Standard click executed");

            // Force click as backup
            const clickEvent = document.createEvent("MouseEvents");
            clickEvent.initEvent("click", true, true);
            button.dispatchEvent(clickEvent);

            // Focus and delayed click
            button.focus();
            setTimeout(() => button.click(), 100);

            return true;
          } catch (error) {
            console.error("Error clicking button:", error);
          }
        }
      }
    }

    // Try specific selectors
    const buttonSelectors = [
      '.css-hb4vw3 > button[data-testid="submit-button"]',
      'button.cds-button-primary[data-testid="submit-button"]',
      '.css-hb4vw3 button[aria-label="Submit"]',
      "button.submit",
      "button.cds-button-primary",
      'button[type="submit"]',
      "button.css-rzyz8b",
      "button.css-xhpqe3",
      ".action-bottom button.primary",
      ".actions-footer button.primary",
    ];

    for (const selector of buttonSelectors) {
      const button = document.querySelector(selector);
      if (button && !button.disabled) {
        console.log(`Found submit button using selector: ${selector}`);
        try {
          button.click();
          console.log("Clicked submit button with selector");
          return true;
        } catch (error) {
          console.error(
            `Error clicking button with selector ${selector}:`,
            error
          );
        }
      }
    }

    // Try submit text buttons
    const submitTexts = [
      "Submit",
      "Submit Quiz",
      "Submit Assignment",
      "Finish",
      "Complete",
      "Done",
    ];
    for (const text of submitTexts) {
      const buttons = Array.from(document.querySelectorAll("button")).filter(
        (btn) =>
          btn.textContent.trim().toLowerCase() === text.toLowerCase() &&
          !btn.disabled
      );

      if (buttons.length > 0) {
        console.log(`Clicking button with text "${text}"`);
        buttons[0].click();
        return true;
      }
    }

    // Try primary/blue buttons (often submit buttons)
    const primaryButtons = Array.from(
      document.querySelectorAll("button")
    ).filter((btn) => {
      const classStr = btn.className;
      return (
        (classStr.includes("primary") ||
          classStr.includes("blue") ||
          classStr.includes("submit")) &&
        !btn.disabled
      );
    });

    if (primaryButtons.length > 0) {
      console.log(
        `Clicking primary-style button: "${primaryButtons[0].textContent.trim()}"`
      );
      primaryButtons[0].click();
      return true;
    }

    console.warn("Could not find any submit button");
    return false;
  }

  function handleReadyToSubmitDialog() {
    const dialogSubmitButton = document.querySelector(
      'button[data-testid="dialog-submit-button"]'
    );
    if (dialogSubmitButton) {
      console.log("Found 'Ready to submit' dialog, clicking Submit...");
      try {
        dialogSubmitButton.click();
        console.log("Clicked 'Submit' button in dialog");
        return true;
      } catch (error) {
        console.error("Error clicking dialog submit button:", error);
      }
    }

    const dialogSubmitButtonBackup = document.querySelector(
      ".css-6z6oep button.cds-button-primary"
    );
    if (dialogSubmitButtonBackup) {
      console.log("Found dialog submit button using backup selector");
      try {
        dialogSubmitButtonBackup.click();
        console.log("Clicked dialog submit button (backup)");
        return true;
      } catch (error) {
        console.error("Error clicking dialog submit button (backup):", error);
      }
    }

    const confirmButtons = Array.from(
      document.querySelectorAll("button")
    ).filter((btn) => {
      const text = btn.textContent.trim().toLowerCase();
      return text.includes("confirm") || text.includes("submit");
    });

    if (confirmButtons.length > 0) {
      console.log("Found potential confirm button, clicking...");
      confirmButtons[0].click();
      return true;
    }

    return false;
  }

  // --- Main Processing Functions ---
  async function processAllQuestions() {
    try {
      console.log("Starting to process all questions...");

      // Check for dialogs first
      const readyToSubmitDialog = document.querySelector(
        '[data-e2e="SubmitDialog__heading"]'
      );
      if (readyToSubmitDialog) {
        console.log("Found 'Ready to submit?' dialog");
        handleReadyToSubmitDialog();
        return;
      }

      // Check if need to retry
      if (checkAndRetryQuiz()) {
        console.log("Initiated quiz retry. Waiting for page to reload...");
        setTimeout(processAllQuestions, 3000);
        return;
      }

      // Handle start attempt dialog
      const startAttemptDialog = document.querySelector(
        '[data-testid="StartAttemptModal__heading"]'
      );
      if (startAttemptDialog) {
        console.log("Found 'Start new attempt' dialog, clicking Continue...");
        const continueButton = document.querySelector(
          '[data-testid="StartAttemptModal__primary-button"]'
        );
        if (continueButton) {
          continueButton.click();
          console.log("Clicked 'Continue' button in Start Attempt dialog");
          setTimeout(processAllQuestions, 2000);
          return;
        }
      }

      // Debug question counts
      const mcqCount = document.querySelectorAll(
        '[data-testid="part-Submission_MultipleChoiceQuestion"]'
      ).length;
      const checkboxCount = document.querySelectorAll(
        '[data-testid="part-Submission_CheckboxQuestion"]'
      ).length;
      const textInputCount = document.querySelectorAll(
        'div[data-testid="part-Submission_RegexQuestion"]'
      ).length;
      const numericInputCount = document.querySelectorAll(
        'div[data-testid="part-Submission_NumericQuestion"]'
      ).length;

      console.log(
        `Found questions: ${mcqCount} MCQ, ${checkboxCount} Checkbox, ${textInputCount} Text, ${numericInputCount} Numeric`
      );

      // Process each question type
      await processMCQQuestions();
      await processCheckboxQuestions();
      await processInputQuestion(
        'div[data-testid="part-Submission_RegexQuestion"]'
      );
      await processInputQuestion(
        'div[data-testid="part-Submission_NumericQuestion"]'
      );

      // Check and tick agreement checkbox
      const agreementCheckbox = document.querySelector(
        'div[data-testid="agreement-standalone-checkbox"] input[type="checkbox"]'
      );
      if (agreementCheckbox && !agreementCheckbox.checked) {
        agreementCheckbox.click();
        console.log("Agreement checkbox ticked.");
      }

      // Submit quiz
      console.log("Attempting to click submit button...");
      const submitClicked = forceClickSubmitButton();

      if (!submitClicked) {
        console.warn(
          "Could not click submit button. Will retry in 2 seconds..."
        );
        setTimeout(() => {
          forceClickSubmitButton();
        }, 2000);
      }

      // Handle confirmation dialog after submit
      setTimeout(() => {
        if (document.querySelector('[data-e2e="SubmitDialog__heading"]')) {
          console.log("Found 'Ready to submit?' dialog after delay");
          handleReadyToSubmitDialog();
        } else {
          // Try finding other confirmation buttons
          const dialogSubmitButton = document.querySelector(
            'button[data-testid="dialog-submit-button"]'
          );
          if (dialogSubmitButton) {
            dialogSubmitButton.click();
            console.log("Dialog Submit button clicked.");
          }
        }
      }, 2000);
    } catch (error) {
      console.error("Error processing questions:", error);
    }
  }

  // --- Navigation and Module Functions ---
  function findQuizzesToDo() {
    const links = Array.from(document.querySelectorAll("a.nostyle"));
    const quizLinks = links.filter((link) => {
      const text = link.textContent.trim().toLowerCase();
      return (
        (text.includes("quiz") &&
          !text.includes("completed") &&
          !text.includes("passed")) ||
        text.includes("failed") ||
        text.includes("retry")
      );
    });

    if (quizLinks.length === 0) {
      console.log("✅ No quizzes to do in this module.");
      return [];
    }

    console.log(`🔢 Found ${quizLinks.length} quizzes to do.`);
    return quizLinks;
  }

  async function attemptQuiz() {
    // List of texts to match exactly
    const exactTexts = [
      "Start assignment",
      "Start Quiz",
      "Resume",
      "Resume Quiz",
      "Attempt quiz",
      "Try again",
      "Retry",
      "Continue",
      "Continue Quiz",
    ];

    // Try exact matches on both buttons and links
    for (const txt of exactTexts) {
      const el = Array.from(document.querySelectorAll("button, a")).find(
        (el) => el.textContent.trim().toLowerCase() === txt.toLowerCase()
      );
      if (el) {
        console.log(`✅ Found exact "${txt}", clicking...`);
        el.click();
        return true;
      }
    }

    // Try partial matches
    const partialKeys = ["start", "resume", "attempt", "continue", "retry"];
    const el = Array.from(document.querySelectorAll("button, a")).find((el) => {
      const t = el.textContent.trim().toLowerCase();
      return partialKeys.some((key) => t.includes(key));
    });

    if (el) {
      console.log(`✅ Found partial "${el.textContent.trim()}", clicking...`);
      el.click();
      return true;
    }

    console.log("❌ No button/link found to attempt quiz.");
    return false;
  }

  // Main workflow
  async function main() {
    // Get all module links
    const moduleLinks = Array.from(document.querySelectorAll("a")).filter((a) =>
      a.textContent.trim().match(/^Module\s\d+$/)
    );

    console.log(`🔢 Found ${moduleLinks.length} modules`);

    if (moduleLinks.length === 0) {
      console.log("❌ No modules found on page.");
      return;
    }

    // Loop through each module
    for (let i = 0; i < moduleLinks.length; i++) {
      console.log(`👉 Opening: ${moduleLinks[i].textContent.trim()}`);
      moduleLinks[i].click();
      await wait(3000);

      // Find quizzes in this module
      const quizLinks = findQuizzesToDo();

      if (quizLinks.length > 0) {
        // Click the first quiz
        console.log(
          `👉 Clicking quiz: ${quizLinks[0].textContent.trim().slice(0, 60)}...`
        );
        quizLinks[0].click();
        await wait(3000);

        // Try to attempt the quiz
        const attempted = await attemptQuiz();

        if (attempted) {
          console.log("✅ Entered quiz, starting to process questions...");
          await wait(3000);

          // Set a flag to track completion
          let quizCompleted = false;
          let attempts = 0;
          const maxAttempts = 3;

          while (!quizCompleted && attempts < maxAttempts) {
            attempts++;
            console.log(
              `Attempt ${attempts}/${maxAttempts} to process and submit quiz`
            );

            // Process all questions and submit
            await processAllQuestions();
            await wait(5000);

            // Check if we've completed
            const onResultsPage =
              document.querySelector(".css-14nrrh0") !== null;
            const backOnCoursePage =
              document.querySelector(
                "a[data-track-component='course_home_button']"
              ) !== null;

            if (onResultsPage || backOnCoursePage) {
              quizCompleted = true;
              console.log("✅ Quiz completed, checking next module.");
            } else {
              console.log(
                "Quiz not yet completed. Waiting and trying again..."
              );
              await wait(5000);
            }
          }

          // Return to course page
          const backToHome = Array.from(document.querySelectorAll("a")).find(
            (a) =>
              a.getAttribute("aria-label") === "Back to course home" ||
              a.textContent.includes("Home") ||
              a.getAttribute("data-track-component") === "course_home_button"
          );

          if (backToHome) {
            backToHome.click();
            await wait(3000);
          }

          // Restart from beginning to check other modules
          return await main();
        }
      } else {
        console.log("➡️ No quizzes to do, moving to next module.");
      }
    }

    console.log("🔁 Return to Module 1");
    moduleLinks[0].click();
  }

  // Start execution
  await main();
  console.log("🏁 Process completed.");
})();
