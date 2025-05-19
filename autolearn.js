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
    const currentPath = window.location.pathname;
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

let done = false;
const slug = window.location.pathname.split("/")[2];

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
      const randomDelay = Math.floor(Math.random() * 2000) + 500;
      
      setTimeout(async () => {
        try {
          await completeReading(item, material.course_id);
          await postAnswer(item, material.course_id);
          await applyEndedVideo(item, slug);
          
          completedItems++;
          console.log(`Processed item ${completedItems}/${totalItems} (delay: ${randomDelay}ms)`);
          
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

// Main execution
(async () => {
  try {
    const material = await getMaterialCourse(slug);
    if (material) {
      console.log(`Found ${material.items.length} items to process`);
      await processItemsWithTimeout(material);
      done = true;
      alert("All items have been processed successfully!");
    } else {
      alert("Failed to get course materials");
    }
  } catch (error) {
    console.error("An error occurred:", error);
    alert("An error occurred while processing the course");
  }
})();
