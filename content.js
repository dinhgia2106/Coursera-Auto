// Content script chạy trên trang web Coursera
console.log("Coursera Auto Learn & Quiz content script đã được tải");

// Biến để theo dõi xem quiz_handler.js đã được inject chưa
let quizHandlerInjected = false;

// Lắng nghe tin nhắn từ popup.js và background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Content script nhận tin nhắn:", message);

  if (message.action === "autoLearn") {
    // Chuyển yêu cầu tới background script
    chrome.runtime.sendMessage({ action: "autoLearn" }, (response) => {
      console.log("Phản hồi từ background script:", response);
    });
    sendResponse({ status: "success" });
  } else if (message.action === "autoQuiz") {
    // Chuyển yêu cầu tới background script
    chrome.runtime.sendMessage({ action: "autoQuiz" }, (response) => {
      console.log("Phản hồi từ background script:", response);
    });
    sendResponse({ status: "success" });
  } else if (message.action === "injectQuizHandler") {
    // Kiểm tra xem quiz_handler.js đã được inject chưa
    if (!quizHandlerInjected) {
      injectQuizHandler();
      quizHandlerInjected = true;
    }

    // Sau khi đã inject, truyền API key tới quiz_handler
    setTimeout(() => {
      chrome.runtime.sendMessage({
        action: "handleQuiz",
        apiKey: message.apiKey,
      });
    }, 1000);

    sendResponse({ status: "success" });
  } else if (message.action === "showAlert") {
    alert(message.message);
    sendResponse({ status: "success" });
  }

  return true; // Đảm bảo sendResponse có thể được gọi bất đồng bộ
});

// Inject quiz_handler.js vào trang
function injectQuizHandler() {
  console.log("Đang inject quiz_handler.js...");
  try {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("quiz_handler.js");
    script.onload = function () {
      console.log("quiz_handler.js đã được inject thành công");
    };
    (document.head || document.documentElement).appendChild(script);
  } catch (error) {
    console.error("Lỗi khi inject quiz_handler.js:", error);
  }
}

// Mã nguồn cho Auto Learn
const autoLearnScript = function () {
  async function applyEndedVideo(itemId, slug) {
    try {
      const response = await fetch(
        `https://www.coursera.org/api/opencourse.v1/user/${getUserId()}/course/${slug}/item/${itemId}/lecture/videoEvents/ended?autoEnroll=false`,
        {
          headers: {
            accept: "/",
            "accept-language": "en",
            "cache-control": "no-cache",
            "content-type": "application/json; charset=UTF-8",
            pragma: "no-cache",
            priority: "u=1, i",
            "sec-ch-ua":
              '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": '"Android"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-requested-with": "XMLHttpRequest",
          },
          referrerPolicy: "strict-origin-when-cross-origin",
          body: '{"contentRequestBody":{}}',
          method: "POST",
          mode: "cors",
          credentials: "include",
        }
      );
      return response.ok;
    } catch (error) {
      console.error("Error in applyEndedVideo:", error);
      return false;
    }
  }

  async function completeReading(itemId, course_id) {
    try {
      const payload = {
        userId: parseInt(getUserId()),
        itemId: itemId,
        courseId: course_id,
      };
      const response = await fetch(
        "https://www.coursera.org/api/onDemandSupplementCompletions.v1",
        {
          headers: {
            accept: "/",
            "accept-language": "en",
            "cache-control": "no-cache",
            "content-type": "application/json; charset=UTF-8",
            pragma: "no-cache",
            priority: "u=1, i",
            "sec-ch-ua":
              '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": '"Android"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-coursera-application": "ondemand",
          },
          referrerPolicy: "strict-origin-when-cross-origin",
          body: JSON.stringify(payload),
          method: "POST",
          mode: "cors",
          credentials: "include",
        }
      );
      return response.ok;
    } catch (error) {
      console.error("Error in completeReading:", error);
      return false;
    }
  }

  function getUserId() {
    const allKeys = Object.keys(localStorage);
    const key = allKeys.find((key) => key.includes("userPreferences"));
    if (!key) return "";
    return key.split(".")[0];
  }

  async function getQuestionId(itemId, course_id) {
    try {
      const response = await fetch(
        `https://www.coursera.org/api/onDemandDiscussionPrompts.v1/${getUserId()}~${course_id}~${itemId}?fields=onDemandDiscussionPromptQuestions.v1(content,creatorId,createdAt,forumId,sessionId,lastAnsweredBy,lastAnsweredAt,totalAnswerCount,topLevelAnswerCount,viewCount),promptType,question&includes=question`,
        {
          headers: {
            accept: "/",
            "accept-language": "en-US,en;q=0.9",
            "cache-control": "no-cache",
            pragma: "no-cache",
            priority: "u=1, i",
            "sec-ch-ua":
              '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": '"Android"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
          },
          referrerPolicy: "strict-origin-when-cross-origin",
          method: "GET",
          mode: "cors",
          credentials: "include",
        }
      );

      const data = await response.json();
      return data.elements[0]?.promptType?.definition?.courseItemForumQuestionId.split(
        "~"
      )[2];
    } catch (error) {
      console.error("Error in getQuestionId:", error);
      return null;
    }
  }

  async function postAnswer(itemId, course_id) {
    try {
      const questionId = await getQuestionId(itemId, course_id);
      if (!questionId) return false;

      const payload = {
        content: {
          typeName: "cml",
          definition: {
            dtdId: "discussion/1",
            value: "<co-content><text>hi</text></co-content>",
          },
        },
        courseForumQuestionId: course_id + "~" + questionId,
      };

      const response = await fetch(
        `https://www.coursera.org/api/onDemandCourseForumAnswers.v1/?fields=content%2CforumQuestionId%2CparentForumAnswerId%2Cstate%2CcreatorId%2CcreatedAt%2Corder%2CupvoteCount%2CchildAnswerCount%2CisFlagged%2CisUpvoted%2CcourseItemForumQuestionId%2CparentCourseItemForumAnswerId%2ConDemandSocialProfiles.v1(userId%2CexternalUserId%2CfullName%2CphotoUrl%2CcourseRole)%2ConDemandCourseForumAnswers.v1(content%2CforumQuestionId%2CparentForumAnswerId%2Cstate%2CcreatorId%2CcreatedAt%2Corder%2CupvoteCount%2CchildAnswerCount%2CisFlagged%2CisUpvoted%2CcourseItemForumQuestionId%2CparentCourseItemForumAnswerId)&includes=profiles%2Cchildren%2CuserId`,
        {
          headers: {
            accept: "/",
            "accept-language": "en",
            "cache-control": "no-cache",
            "content-type": "application/json; charset=UTF-8",
            pragma: "no-cache",
            priority: "u=1, i",
            "sec-ch-ua":
              '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": '"Android"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "x-coursera-application": "ondemand",
          },
          referrerPolicy: "strict-origin-when-cross-origin",
          body: JSON.stringify(payload),
          method: "POST",
          mode: "cors",
          credentials: "include",
        }
      );
      return response.ok;
    } catch (error) {
      console.error("Error in postAnswer:", error);
      return false;
    }
  }

  async function getMaterialCourse(slug) {
    try {
      const response = await fetch(
        `https://www.coursera.org/api/onDemandCourseMaterials.v2/?q=slug&slug=${slug}&includes=modules%2Clessons%2CpassableItemGroups%2CpassableItemGroupChoices%2CpassableLessonElements%2Citems%2Ctracks%2CgradePolicy%2CgradingParameters%2CembeddedContentMapping&fields=moduleIds%2ConDemandCourseMaterialModules.v1(name%2Cslug%2Cdescription%2CtimeCommitment%2ClessonIds%2Coptional%2ClearningObjectives)%2ConDemandCourseMaterialLessons.v1(name%2Cslug%2CtimeCommitment%2CelementIds%2Coptional%2CtrackId)%2ConDemandCourseMaterialPassableItemGroups.v1(requiredPassedCount%2CpassableItemGroupChoiceIds%2CtrackId)%2ConDemandCourseMaterialPassableItemGroupChoices.v1(name%2Cdescription%2CitemIds)%2ConDemandCourseMaterialPassableLessonElements.v1(gradingWeight%2CisRequiredForPassing)%2ConDemandCourseMaterialItems.v2(name%2CoriginalName%2Cslug%2CtimeCommitment%2CcontentSummary%2CisLocked%2ClockableByItem%2CitemLockedReasonCode%2CtrackId%2ClockedStatus%2CitemLockSummary)%2ConDemandCourseMaterialTracks.v1(passablesCount)%2ConDemandGradingParameters.v1(gradedAssignmentGroups)%2CcontentAtomRelations.v1(embeddedContentSourceCourseId%2CsubContainerId)&showLockedItems=true`,
        {
          headers: {
            accept: "/",
            "accept-language": "en",
            "cache-control": "no-cache",
            pragma: "no-cache",
            priority: "u=1, i",
            "sec-ch-ua":
              '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": '"Android"',
          },
          referrerPolicy: "strict-origin-when-cross-origin",
          method: "GET",
          credentials: "include",
        }
      );

      const data = await response.json();
      let allItems = [];
      if (response.ok) {
        data.linked["onDemandCourseMaterialLessons.v1"].forEach((lesson) => {
          allItems = [...allItems, ...lesson.itemIds];
        });
        return { items: allItems, course_id: data.elements[0].id };
      }
      return null;
    } catch (error) {
      console.error("Error in getMaterialCourse:", error);
      return null;
    }
  }

  async function processItemsWithTimeout(material) {
    if (!material) {
      alert("Failed to get course materials");
      return;
    }

    const totalItems = material.items.length;
    let completedItems = 0;

    return new Promise((resolve) => {
      material.items.forEach((item, index) => {
        // Generate random delay between 1-3 seconds (1000-3000ms)
        const randomDelay = (Math.floor(Math.random() * 2000) + 500) * 0.3;

        setTimeout(async () => {
          try {
            await completeReading(item, material.course_id);
            await postAnswer(item, material.course_id);
            await applyEndedVideo(item, slug);

            completedItems++;
            console.log(
              `Processed item ${completedItems}/${totalItems} (delay: ${randomDelay}ms)`
            );

            if (completedItems === totalItems) {
              resolve();
            }
          } catch (error) {
            console.error(`Error processing item ${item}:`, error);
            completedItems++;
            if (completedItems === totalItems) {
              resolve();
            }
          }
        }, index * randomDelay); // Random delay between 1-3 seconds
      });
    });
  }

  const slug = window.location.pathname.split("/")[2];

  async function startAutoLearn() {
    try {
      console.log("Starting Auto Learn...");
      const material = await getMaterialCourse(slug);
      if (material) {
        console.log(`Found ${material.items.length} items to process`);
        await processItemsWithTimeout(material);
        console.log("All items have been processed successfully!");
        alert("All items have been processed successfully!");
      } else {
        console.error("Failed to get course materials");
        alert("Failed to get course materials");
      }
    } catch (error) {
      console.error("An error occurred:", error);
      alert("An error occurred while processing the course");
    }
  }

  // Khởi chạy auto learn
  startAutoLearn();
};

// Mã nguồn cho Auto Quiz
const autoQuizScript = function (apiKey) {
  // Script tự động làm quiz trên Coursera
  const API_KEY = apiKey;

  // Gemini API config
  const API_URL =
    "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent";

  // Thông tin để ghi log
  const DEBUG = true;

  // Những từ khóa để phát hiện quiz
  const QUIZ_KEYWORDS = ["quiz", "graded", "assignment"];

  // Từ khóa để bỏ qua
  const SKIP_KEYWORDS = ["peer", "peer-graded"];

  // Trạng thái
  let moduleQueue = [];
  let currentModule = null;
  let processingQuiz = false;
  let moduleProcessingComplete = false;

  // Lưu trữ thông tin về các câu hỏi đã làm và đáp án sai để tránh chọn lại
  const STORAGE_KEY = "quiz_incorrect_answers";

  // Thêm các biến toàn cục này ở đầu IIFE của bạn, gần chỗ khai báo moduleQueue cũ
  let allAvailableModules = [];
  let currentModuleToProcess = null; // Object: {url, element, title, moduleNumber}

  // Helper function để lấy số thứ tự module từ URL (để sắp xếp)
  function extractModuleNumber(url) {
    const match = url.match(/\/module\/(\d+)/);
    return match ? parseInt(match[1], 10) : Infinity;
  }

  // Log với màu nếu Debug mode bật
  function log(message, type = "info") {
    if (!DEBUG) return;

    const styles = {
      info: "color: #3498db; font-weight: bold;",
      success: "color: #2ecc71; font-weight: bold;",
      warning: "color: #f39c12; font-weight: bold;",
      error: "color: #e74c3c; font-weight: bold;",
    };

    console.log(`%c[COURSERA-AUTO] ${message}`, styles[type] || styles.info);
  }

  // Các hàm giống như findAllModules, containsKeywords, shouldSkipQuiz...
  function findAllModules() {
    log("Đang tìm tất cả các module có thể click...");
    let modules = [];
    // Selector này cần nhắm đúng vào các link/button chuyển module chính của khóa học
    const moduleElements = document.querySelectorAll(
      'a[href*="/home/module/"]'
    );
    const uniqueUrls = new Set();

    moduleElements.forEach((link) => {
      const href = link.getAttribute("href").split("#")[0];
      if (href.includes("/home/module/") && !uniqueUrls.has(href)) {
        uniqueUrls.add(href);
        modules.push({
          url: href,
          element: link,
          title: link.textContent.trim() || href,
          moduleNumber: extractModuleNumber(href),
        });
      }
    });

    modules.sort((a, b) => a.moduleNumber - b.moduleNumber); // Sắp xếp theo số module
    modules.forEach((m) =>
      log(`Đã tìm thấy module: ${m.title} (URL: ${m.url})`, "info")
    );
    return modules;
  }

  // Hàm bắt đầu tự động làm quiz
  function startAutoQuiz() {
    log("Bắt đầu/Tiếp tục tự động làm quiz...", "info");

    // Kiểm tra API Key
    if (!API_KEY) {
      alert(
        "API Key chưa được thiết lập. Vui lòng nhập API Key trong popup của extension."
      );
      return;
    }

    // Luôn lấy lại danh sách module mỗi khi hàm này được gọi
    allAvailableModules = findAllModules();

    if (allAvailableModules.length === 0) {
      if (
        window.location.href.includes("/assignment-submission/") ||
        window.location.href.includes("/quiz/")
      ) {
        log("Đang ở trang quiz/assignment. Chờ xử lý quiz hoàn tất...", "info");
        // Thêm logic để xử lý quiz ở đây
      } else {
        log(
          "Không tìm thấy module nào trên trang này. Script có thể đã bị dừng hoặc trang không hợp lệ.",
          "error"
        );
      }
      return;
    }
    log(
      `Tìm thấy ${allAvailableModules.length} module có thể click.`,
      "success"
    );

    // Tiếp tục với logic tìm và làm quiz
    // Logic từ improved_autoquiz.js sẽ được thêm vào đây
  }

  // Khởi chạy auto quiz
  startAutoQuiz();
};
