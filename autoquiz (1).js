(function () {
  // Gemini API configuration
  const API_KEY = "key_here";
  const API_URL =
    "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent";

  // Lưu trữ thông tin về các câu hỏi đã làm và đáp án sai để tránh chọn lại
  const STORAGE_KEY = "quiz_incorrect_answers";

  // Lấy dữ liệu câu trả lời sai từ localStorage
  function getIncorrectAnswers() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (error) {
      console.error("Error retrieving incorrect answers from storage:", error);
      return {};
    }
  }

  // Lưu dữ liệu câu trả lời sai vào localStorage
  function saveIncorrectAnswers(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error("Error saving incorrect answers to storage:", error);
    }
  }

  // Thêm đáp án không đúng vào danh sách tránh
  function addIncorrectAnswer(questionText, incorrectAnswerText) {
    const data = getIncorrectAnswers();
    if (!data[questionText]) {
      data[questionText] = [];
    }
    // Thêm câu trả lời sai nếu chưa có trong danh sách
    if (!data[questionText].includes(incorrectAnswerText)) {
      data[questionText].push(incorrectAnswerText);
    }
    saveIncorrectAnswers(data);
    console.log(
      `Added incorrect answer for question: "${questionText}": "${incorrectAnswerText}"`
    );
  }

  // Kiểm tra xem đáp án có được đánh dấu là sai từ trước không
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

  // Hàm chuẩn hóa văn bản: loại bỏ khoảng trắng thừa và chuyển về chữ thường
  function normalizeText(text) {
    return text?.replace(/\s+/g, " ").trim().toLowerCase() || "";
  }

  // Hàm tính khoảng cách Levenshtein giữa 2 chuỗi
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

  // Phát hiện số lượng lựa chọn cần chọn từ câu hỏi
  function detectRequiredSelections(questionText) {
    // Tìm các mẫu như "Select two", "Choose three", etc.
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

    // Mặc định là 1 nếu không tìm thấy
    return 1;
  }

  // Hàm gọi API Gemini để lấy đáp án cho câu hỏi
  async function getAnswerFromGemini(
    questionText,
    optionTexts = [],
    incorrectOptions = [],
    isCheckbox = false
  ) {
    try {
      console.log("Querying Gemini API for:", questionText);

      // Xác định số lượng lựa chọn cần chọn
      const requiredSelections = isCheckbox
        ? detectRequiredSelections(questionText)
        : 1;

      // Xây dựng prompt với các lựa chọn và đánh dấu những đáp án đã biết là sai
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

      console.log("Prompt sent to Gemini:", prompt);

      const response = await fetch(`${API_URL}?key=${API_KEY}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          },
        }),
      });

      const data = await response.json();

      if (data.error) {
        console.error("Gemini API error:", data.error);
        return null;
      }

      // Lấy text từ response
      const answer = data.candidates[0].content.parts[0].text.trim();
      console.log("Gemini response:", answer);
      return answer;
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      return null;
    }
  }

  // Dành cho MCQ: lấy text của một option
  function getOptionText(optionElement) {
    // Lấy text từ thẻ CML viewer bên trong option
    const textContainer = optionElement.querySelector(
      ".rc-CML [data-testid='cml-viewer']"
    );
    return textContainer ? textContainer.textContent.trim() : "";
  }

  // Lấy label (A, B, C, D) của option
  function getOptionLabel(optionIndex) {
    const labels = ["A", "B", "C", "D", "E", "F", "G", "H"];
    return labels[optionIndex] || "";
  }

  // Phân tích đáp án nhiều lựa chọn từ Gemini
  function parseMultipleAnswers(answer) {
    // Tìm tất cả chữ cái đại diện cho đáp án (A-H)
    const answerLetters = answer.match(/[A-H]/g) || [];

    // Nếu không tìm thấy chữ cái, thử phân tích từ câu trả lời
    if (answerLetters.length === 0) {
      // Tìm các ký tự đầu tiên của mỗi dòng hoặc đoạn văn
      const lines = answer.split(/[\n,;.]/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0 && /^[A-H]/i.test(trimmed)) {
          answerLetters.push(trimmed[0].toUpperCase());
        }
      }
    }

    return [...new Set(answerLetters)]; // Loại bỏ các chữ cái trùng lặp
  }

  // Kiểm tra và thu thập dữ liệu câu trả lời đúng/sai từ trang kết quả
  function collectIncorrectAnswersFromResults() {
    // Tìm tất cả câu hỏi đã được đánh giá
    const evaluatedQuestions = document.querySelectorAll(
      '[data-testid^="part-Submission_"][data-testid$="Question"]'
    );
    let collected = false;

    evaluatedQuestions.forEach((question) => {
      // Tìm văn bản câu hỏi
      const promptElement = question.querySelector(
        '[id^="prompt-autoGradableElementId"], [id^="prompt-autoGradableResponseId"]'
      );
      if (!promptElement) return;

      const questionText = promptElement.textContent.trim();

      // Xử lý câu hỏi radio (MCQ)
      if (
        question.getAttribute("data-testid").includes("MultipleChoiceQuestion")
      ) {
        // Tìm các option và xác định đáp án được chọn nhưng sai
        const options = question.querySelectorAll(".rc-Option");
        options.forEach((option) => {
          const isChecked = option.querySelector('input[type="radio"]:checked');
          const isCorrect = option.parentElement.querySelector(".css-1ucwtwj"); // Icon correct
          const isIncorrect = option.parentElement.querySelector(".css-pn7qkz"); // Icon incorrect

          const answerText = getOptionText(option);

          if (isChecked && !isCorrect) {
            // Đây là đáp án đã chọn nhưng sai
            addIncorrectAnswer(questionText, answerText);
            collected = true;
          }
        });
      }
      // Xử lý câu hỏi checkbox (multiple select)
      else if (
        question.getAttribute("data-testid").includes("CheckboxQuestion")
      ) {
        // Tìm các option đã chọn nhưng sai
        const options = question.querySelectorAll(".rc-Option");
        options.forEach((option) => {
          const isChecked = option.querySelector(
            'input[type="checkbox"]:checked'
          );

          // Kiểm tra xem option này có được đánh dấu là incorrect không
          const optionContainer = option.closest(".css-18k2uoc");
          const optionId = optionContainer
            ? optionContainer.getAttribute("data-testid")
            : null;
          const isIncorrect = question.querySelector(
            `.css-pn7qkz[data-for="${optionId}"]`
          );

          const answerText = getOptionText(option);

          if (isChecked && isIncorrect) {
            // Đây là đáp án đã chọn nhưng sai
            addIncorrectAnswer(questionText, answerText);
            collected = true;
          }
        });
      }
    });

    return collected;
  }

  // Kiểm tra xem có cần retry quiz không
  function checkAndRetryQuiz() {
    // Kiểm tra xem có đang ở trang kết quả không (có hiển thị grade)
    const gradeElement = document.querySelector(".css-14nrrh0");
    if (!gradeElement) return false;

    // Lấy điểm và kiểm tra xem có pass không
    const gradeText = gradeElement.textContent.trim();
    const gradePercentage = parseInt(gradeText.replace("%", ""), 10);

    console.log(`Current grade: ${gradePercentage}%`);

    // Nếu điểm dưới 70%, cần retry
    if (gradePercentage < 70) {
      console.log("Quiz not passed. Need to retry.");

      // Thu thập các câu trả lời sai
      const collected = collectIncorrectAnswersFromResults();
      if (collected) {
        console.log("Collected incorrect answers for next attempt");
      }

      // Tìm và click nút retry
      const retryButton = document.querySelector(
        '[data-testid="CoverPageActionButton"]'
      );
      if (retryButton) {
        console.log("Clicking retry button...");
        retryButton.click();

        // Xử lý dialog xác nhận "Start new attempt?" sau khi bấm retry
        setTimeout(() => {
          const continueButton = document.querySelector(
            '[data-testid="StartAttemptModal__primary-button"]'
          );
          if (continueButton) {
            console.log(
              "Clicking 'Continue' button in retry confirmation dialog..."
            );
            continueButton.click();
          } else {
            console.warn(
              "Continue button in retry confirmation dialog not found"
            );
          }
        }, 1000);

        return true;
      } else {
        console.warn("Retry button not found");
      }
    } else {
      console.log("Quiz passed. No need to retry.");
    }

    return false;
  }

  // --- Xử lý câu hỏi dạng trắc nghiệm (MCQ) ---
  async function processMCQQuestions() {
    // Xác định tất cả container của các câu hỏi MCQ
    const questionContainers = document.querySelectorAll(
      '[data-testid="part-Submission_MultipleChoiceQuestion"]'
    );

    for (const container of questionContainers) {
      // Lấy prompt element chứa câu hỏi
      const promptElement = container.querySelector(
        'div[id^="prompt-autoGradableResponseId"]'
      );
      if (!promptElement) continue;

      const questionText = promptElement.textContent.trim();
      console.log("Processing MCQ question:", questionText);

      // Lấy container chứa các option
      const optionsContainer = container.querySelector('[role="radiogroup"]');
      if (!optionsContainer) {
        console.warn(
          "Không tìm thấy container đáp án (MCQ) cho câu hỏi:",
          questionText
        );
        continue;
      }

      // Lấy tất cả các option
      const optionElements = Array.from(
        optionsContainer.querySelectorAll(".rc-Option")
      );

      // Nếu không tìm thấy option nào
      if (!optionElements.length) {
        console.warn(
          "Không tìm thấy đáp án nào cho câu hỏi (MCQ):",
          questionText
        );
        continue;
      }

      // Kiểm tra xem có đáp án nào đã được chọn chưa
      const alreadySelected = optionElements.some((option) =>
        option.querySelector('input[type="radio"]:checked')
      );

      if (alreadySelected) {
        console.log("Question already answered, skipping:", questionText);
        continue;
      }

      // Xây dựng mảng options với format "A. Text"
      const optionTexts = optionElements.map((option, index) => {
        const text = getOptionText(option);
        const label = getOptionLabel(index);
        return `${label}. ${text}`;
      });

      // Kiểm tra các đáp án đã biết là sai từ lần thử trước
      const incorrectOptionIndices = [];
      optionElements.forEach((option, index) => {
        const optionText = getOptionText(option);
        if (isKnownIncorrectAnswer(questionText, optionText)) {
          incorrectOptionIndices.push(index);
          console.log(
            `Option ${getOptionLabel(index)} is known to be incorrect:`,
            optionText
          );
        }
      });

      // Gọi Gemini API để lấy đáp án
      const answer = await getAnswerFromGemini(
        questionText,
        optionTexts,
        incorrectOptionIndices,
        false
      );

      if (!answer) {
        console.warn(
          "Không nhận được đáp án từ Gemini cho câu hỏi (MCQ):",
          questionText
        );
        continue;
      }

      // Kiểm tra nếu đáp án chỉ là một chữ cái (A, B, C, D, ...)
      const letterMatch = answer.match(/^([A-Z])(\.|$)/);
      if (letterMatch) {
        // Tìm option phù hợp với chữ cái
        const letter = letterMatch[1];
        const letterIndex = letter.charCodeAt(0) - "A".charCodeAt(0);

        if (letterIndex >= 0 && letterIndex < optionElements.length) {
          const optionToSelect = optionElements[letterIndex];
          const optionText = getOptionText(optionToSelect);

          // Kiểm tra xem đáp án này có đã biết là sai không
          if (isKnownIncorrectAnswer(questionText, optionText)) {
            console.warn(
              `Gemini suggested option ${letter} but it's known to be incorrect:`,
              optionText
            );

            // Chọn một option khác không thuộc danh sách sai
            const availableOptions = optionElements.filter(
              (_, index) => !incorrectOptionIndices.includes(index)
            );

            if (availableOptions.length > 0) {
              const fallbackOption = availableOptions[0];
              const input = fallbackOption.querySelector("input");
              if (input && !input.checked) {
                input.click();
                console.log(
                  `Selected fallback option with text:`,
                  getOptionText(fallbackOption)
                );
              }
            } else {
              console.warn(
                "No safe options available after filtering incorrect answers"
              );
            }
          } else {
            // Đáp án không thuộc danh sách sai, tiến hành chọn
            const input = optionToSelect.querySelector("input");
            if (input && !input.checked) {
              input.click();
              console.log(`Clicked option ${letter} with text:`, optionText);
            }
          }
        } else {
          console.warn(
            `Invalid option letter ${letter} for question:`,
            questionText
          );
        }
      } else {
        // Tìm option có nội dung gần nhất với đáp án
        let bestOption = null;
        let bestOptionIndex = -1;
        let bestOptionDistance = Infinity;

        optionElements.forEach((option, index) => {
          const optionText = getOptionText(option);

          // Bỏ qua nếu đáp án này đã biết là sai
          if (isKnownIncorrectAnswer(questionText, optionText)) {
            console.log(`Skipping known incorrect option:`, optionText);
            return;
          }

          const distance = levenshtein(
            normalizeText(optionText),
            normalizeText(answer)
          );

          console.log(
            "So sánh option (MCQ):",
            optionText,
            "với",
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
              `Clicked option ${getOptionLabel(bestOptionIndex)} with text:`,
              getOptionText(bestOption)
            );
          }
        } else {
          console.warn(
            "Không tìm thấy đáp án phù hợp sau khi lọc các đáp án sai:",
            questionText
          );

          // Nếu không tìm thấy đáp án phù hợp sau khi lọc, chọn đáp án đầu tiên không thuộc danh sách sai
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

  // --- Xử lý câu hỏi dạng checkbox (Multiple selection) ---
  async function processCheckboxQuestions() {
    // Xác định tất cả container của các câu hỏi Checkbox
    const questionContainers = document.querySelectorAll(
      '[data-testid="part-Submission_CheckboxQuestion"]'
    );

    for (const container of questionContainers) {
      // Lấy prompt element chứa câu hỏi
      const promptElement = container.querySelector(
        'div[id^="prompt-autoGradableResponseId"]'
      );
      if (!promptElement) continue;

      const questionText = promptElement.textContent.trim();
      console.log("Processing Checkbox question:", questionText);

      // Lấy container chứa các option
      const optionsContainer = container.querySelector('[role="group"]');
      if (!optionsContainer) {
        console.warn(
          "Không tìm thấy container đáp án (Checkbox) cho câu hỏi:",
          questionText
        );
        continue;
      }

      // Lấy tất cả các option
      const optionElements = Array.from(
        container.querySelectorAll(".rc-Option")
      );

      // Nếu không tìm thấy option nào
      if (!optionElements.length) {
        console.warn(
          "Không tìm thấy đáp án nào cho câu hỏi (Checkbox):",
          questionText
        );
        continue;
      }

      // Kiểm tra xem có đáp án nào đã được chọn chưa
      const selectedCount = optionElements.filter((option) =>
        option.querySelector('input[type="checkbox"]:checked')
      ).length;

      const requiredSelections = detectRequiredSelections(questionText);

      if (selectedCount >= requiredSelections) {
        console.log(
          `Question already has ${selectedCount}/${requiredSelections} selections, skipping:`,
          questionText
        );
        continue;
      }

      // Xây dựng mảng options với format "A. Text"
      const optionTexts = optionElements.map((option, index) => {
        const text = getOptionText(option);
        const label = getOptionLabel(index);
        return `${label}. ${text}`;
      });

      // Kiểm tra các đáp án đã biết là sai từ lần thử trước
      const incorrectOptionIndices = [];
      optionElements.forEach((option, index) => {
        const optionText = getOptionText(option);
        if (isKnownIncorrectAnswer(questionText, optionText)) {
          incorrectOptionIndices.push(index);
          console.log(
            `Option ${getOptionLabel(index)} is known to be incorrect:`,
            optionText
          );
        }
      });

      // Gọi Gemini API để lấy đáp án
      const answer = await getAnswerFromGemini(
        questionText,
        optionTexts,
        incorrectOptionIndices,
        true
      );

      if (!answer) {
        console.warn(
          "Không nhận được đáp án từ Gemini cho câu hỏi (Checkbox):",
          questionText
        );
        continue;
      }

      // Phân tích đáp án nhiều lựa chọn
      const selectedLetters = parseMultipleAnswers(answer);
      console.log(`Parsed selected options: ${selectedLetters.join(", ")}`);

      if (selectedLetters.length === 0) {
        console.warn(
          "Couldn't parse any option letters from Gemini response:",
          answer
        );
        continue;
      }

      // Xóa tất cả các lựa chọn hiện tại
      optionElements.forEach((option) => {
        const checkbox = option.querySelector('input[type="checkbox"]:checked');
        if (checkbox) {
          checkbox.click();
          console.log("Unselected previous option:", getOptionText(option));
        }
      });

      // Chọn các option theo đáp án
      let selectionCount = 0;

      // Đầu tiên xử lý các tùy chọn từ đáp án của Gemini
      for (const letter of selectedLetters) {
        if (selectionCount >= requiredSelections) break;

        const letterIndex = letter.charCodeAt(0) - "A".charCodeAt(0);

        if (letterIndex >= 0 && letterIndex < optionElements.length) {
          const optionToSelect = optionElements[letterIndex];
          const optionText = getOptionText(optionToSelect);

          // Kiểm tra xem đáp án này có đã biết là sai không
          if (isKnownIncorrectAnswer(questionText, optionText)) {
            console.warn(
              `Gemini suggested option ${letter} but it's known to be incorrect:`,
              optionText
            );
            continue;
          }

          // Đáp án không thuộc danh sách sai, tiến hành chọn
          const input = optionToSelect.querySelector("input[type='checkbox']");
          if (input && !input.checked) {
            input.click();
            console.log(`Selected option ${letter} with text:`, optionText);
            selectionCount++;
          }
        }
      }

      // Nếu vẫn chưa đủ lựa chọn, chọn thêm từ các tùy chọn an toàn
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

  // --- Xử lý câu hỏi dạng điền đáp án (Text & Numeric) ---
  async function processInputQuestion(selector) {
    const containers = document.querySelectorAll(selector);

    for (const container of containers) {
      const prompt = container.querySelector(
        '[id^="prompt-autoGradableResponseId"]'
      );
      if (!prompt) continue;

      const questionText = prompt.textContent.trim();
      console.log("Processing Input question:", questionText);

      const inputElement = container.querySelector(
        'input[type="text"], input[type="number"]'
      );

      if (!inputElement) {
        console.warn("Không tìm thấy input cho câu hỏi (Input):", questionText);
        continue;
      }

      // Kiểm tra xem đã có giá trị hay chưa
      if (inputElement.value.trim()) {
        console.log("Input already has value, skipping:", questionText);
        continue;
      }

      // Gọi Gemini API để lấy đáp án
      const answer = await getAnswerFromGemini(questionText);

      if (!answer) {
        console.warn(
          "Không nhận được đáp án từ Gemini cho câu hỏi (Input):",
          questionText
        );
        continue;
      }

      // Sử dụng setter của native input để cập nhật giá trị (hữu ích trong các ứng dụng React)
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

  // Hàm cải tiến để tìm và click nút submit một cách đáng tin cậy hơn
  function forceClickSubmitButton() {
    // Debug all submit button candidates
    console.log("Looking for submit buttons...");
    const allButtons = document.querySelectorAll("button");

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

        console.log("Found button:", {
          text: button.textContent.trim(),
          "data-testid": button.getAttribute("data-testid"),
          "aria-label": button.getAttribute("aria-label"),
          classes: button.className,
          disabled: isDisabled,
        });

        if (!isDisabled) {
          console.log("Attempting to click valid submit button...");

          try {
            // Try standard click first
            button.click();
            console.log("Standard click executed");

            // Force-click as a backup
            const clickEvent = document.createEvent("MouseEvents");
            clickEvent.initEvent("click", true, true);
            button.dispatchEvent(clickEvent);
            console.log("Forced click event dispatched");

            // Attempt to focus and then click
            button.focus();
            setTimeout(() => button.click(), 100);
            console.log("Focus + delayed click executed");

            return true;
          } catch (error) {
            console.error("Error clicking button:", error);
          }
        }
      }
    }

    // Specifically target the button in the container shown in the example
    const specificButtonSelectors = [
      '.css-hb4vw3 > button[data-testid="submit-button"]',
      'button.cds-button-primary[data-testid="submit-button"]',
      '.css-hb4vw3 button[aria-label="Submit"]',
    ];

    for (const selector of specificButtonSelectors) {
      const specificButton = document.querySelector(selector);
      if (specificButton) {
        console.log(`Found specific submit button using selector: ${selector}`);

        try {
          specificButton.click();
          console.log("Clicked specific submit button");
          setTimeout(() => {
            console.log("Delay 2s done");
          }, 2000);
          return true;
        } catch (error) {
          console.error(
            `Error clicking specific button with selector ${selector}:`,
            error
          );
        }
      }
    }

    console.warn("Could not find or click any submit button");
    return false;
  }

  // Hàm xử lý dialog "Ready to submit?"
  function handleReadyToSubmitDialog() {
    // Tìm nút submit trong dialog
    const dialogSubmitButton = document.querySelector(
      'button[data-testid="dialog-submit-button"]'
    );
    if (dialogSubmitButton) {
      console.log("Found 'Ready to submit' dialog, clicking Submit button...");
      try {
        dialogSubmitButton.click();
        console.log("Clicked 'Submit' button in the dialog");
        return true;
      } catch (error) {
        console.error("Error clicking dialog submit button:", error);
      }
    }

    // Backup: tìm nút submit trong dialog dựa vào container và class
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

    return false;
  }

  // Hàm chính để xử lý tất cả loại câu hỏi
  async function processAllQuestions() {
    try {
      // Kiểm tra xem có dialog "Ready to submit?" không
      const readyToSubmitDialog = document.querySelector(
        '[data-e2e="SubmitDialog__heading"]'
      );
      if (readyToSubmitDialog) {
        console.log("Found 'Ready to submit?' dialog");
        handleReadyToSubmitDialog();
        return;
      }

      // Kiểm tra xem có cần retry không
      if (checkAndRetryQuiz()) {
        console.log("Initiated quiz retry. Waiting for page to reload...");
        // Chờ một khoảng thời gian cho trang tải lại
        setTimeout(processAllQuestions, 3000);
        return;
      }

      // Kiểm tra và xử lý dialog xác nhận "Start new attempt?"
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
          // Chờ trang load sau khi bấm Continue
          setTimeout(processAllQuestions, 2000);
          return;
        }
      }

      // Xử lý câu hỏi MCQ
      await processMCQQuestions();

      // Xử lý câu hỏi Checkbox (Multiple selection)
      await processCheckboxQuestions();

      // Xử lý câu hỏi điền đáp án
      await processInputQuestion(
        'div[data-testid="part-Submission_RegexQuestion"]'
      );
      await processInputQuestion(
        'div[data-testid="part-Submission_NumericQuestion"]'
      );

      // --- Sau khi xử lý xong, in ra thông tin debug cho các câu điền đáp án ---
      function debugFilledInputQuestions(selector, typeLabel) {
        const containers = document.querySelectorAll(selector);
        containers.forEach((container, index) => {
          const prompt = container.querySelector(
            '[id^="prompt-autoGradableResponseId"]'
          );
          const inputElement = container.querySelector(
            'input[type="text"], input[type="number"]'
          );
          if (prompt && inputElement) {
            console.log(
              `[DEBUG ${typeLabel}][${
                index + 1
              }] Question: "${prompt.textContent.trim()}"`
            );
            console.log(
              `[DEBUG ${typeLabel}][${index + 1}] Filled answer: "${
                inputElement.value
              }"`
            );
          }
        });
      }

      debugFilledInputQuestions(
        'div[data-testid="part-Submission_RegexQuestion"]',
        "Regex"
      );
      debugFilledInputQuestions(
        'div[data-testid="part-Submission_NumericQuestion"]',
        "Numeric"
      );

      // --- Bước 2: Tick vào ô đồng ý (Agreement checkbox) ---
      const agreementCheckbox = document.querySelector(
        'div[data-testid="agreement-standalone-checkbox"] input[type="checkbox"]'
      );
      if (agreementCheckbox && !agreementCheckbox.checked) {
        agreementCheckbox.click();
        console.log("Agreement checkbox ticked.");
      } else {
        console.log("Agreement checkbox không tìm thấy hoặc đã được tick.");
      }

      // --- Bước 3: Click nút Submit ban đầu (sử dụng hàm mới cải tiến) ---
      console.log("Attempting to click submit button...");
      const submitClicked = forceClickSubmitButton();

      if (!submitClicked) {
        console.warn(
          "Could not click submit button. Will retry in 1 second..."
        );
        // Retry after a short delay
        setTimeout(() => {
          forceClickSubmitButton();
        }, 1000);
      }

      // --- Bước 4: Sau 2 giây, check và handle dialog "Ready to submit?" ---
      setTimeout(() => {
        // Kiểm tra xem dialog "Ready to submit?" đã xuất hiện chưa
        if (document.querySelector('[data-e2e="SubmitDialog__heading"]')) {
          console.log("Found 'Ready to submit?' dialog after delay");
          handleReadyToSubmitDialog();
        } else {
          // Tìm kiếm dialog submit button thông thường
          const dialogSubmitButton = document.querySelector(
            'button[data-testid="dialog-submit-button"]'
          );
          if (dialogSubmitButton) {
            dialogSubmitButton.click();
            console.log("Dialog Submit button clicked.");
          } else {
            console.warn(
              "Dialog Submit button không tìm thấy, sẽ tìm các nút tương tự..."
            );

            // Tìm các nút có text hoặc label liên quan đến submit/confirm
            const confirmButtons = Array.from(
              document.querySelectorAll("button")
            ).filter((btn) => {
              const text = btn.textContent.trim().toLowerCase();
              const label = (
                btn.getAttribute("aria-label") || ""
              ).toLowerCase();
              return (
                text.includes("confirm") ||
                text.includes("submit") ||
                label.includes("confirm") ||
                label.includes("submit")
              );
            });

            if (confirmButtons.length > 0) {
              console.log("Found potential confirm button, clicking...");
              confirmButtons[0].click();
            }
          }
        }
      }, 2000);
    } catch (error) {
      console.error("Error processing questions:", error);
    }
  }

  // Bắt đầu xử lý tất cả câu hỏi
  processAllQuestions();
})();
