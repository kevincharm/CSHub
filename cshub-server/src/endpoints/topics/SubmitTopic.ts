import {Request, Response} from "express";

import {app} from "../../";
import logger from "../../utilities/Logger";

import {SubmitTopic} from "../../../../cshub-shared/src/api-calls";
import {getTopicFromHash} from "../../../../cshub-shared/src/utilities/Topics";

import {validateMultipleInputs} from "../../utilities/StringUtils";
import {generateRandomTopicHash, getTopicTree} from "../../utilities/TopicsUtils";
import {DatabaseResultSet, query} from "../../db/database-query";
import {checkTokenValidity} from "../../auth/AuthMiddleware";

app.post(SubmitTopic.getURL, (req: Request, res: Response) => {

    const submitTopicRequest: SubmitTopic = req.body as SubmitTopic;

    const userObj = checkTokenValidity(req);

    const inputsValidation = validateMultipleInputs({
        input: submitTopicRequest.topicTitle,
        validationObject: {
            minlength: 2,
            maxlength: 35
        }
    }, {input: submitTopicRequest.topicParentHash});

    if (inputsValidation.valid && userObj.tokenObj.user.admin) {
        const topics = getTopicTree();
        topics
            .then((topics) => {
                if (topics === null) {
                    logger.error(`No topics found`);
                    res.status(500).send();
                } else {
                    const requestTopic = getTopicFromHash(submitTopicRequest.topicParentHash, topics);

                    if (requestTopic === null) {
                        res.sendStatus(400);
                    } else {
                        query(`
                          SELECT id
                          FROM topics
                          WHERE name = ?
                        `, submitTopicRequest.topicTitle)
                            .then((data: DatabaseResultSet) => {
                                if (data.convertRowsToResultObjects().length !== 0) {
                                    res.sendStatus(409);
                                } else {
                                    return generateRandomTopicHash();
                                }
                            })
                            .then((topicHash) => {
                                if (typeof topicHash !== "undefined") {
                                    return query(`
                                      INSERT INTO topics
                                      SET name     = ?,
                                          parentid = ?,
                                          hash     = ?
                                    `, submitTopicRequest.topicTitle, requestTopic.id, topicHash)
                                }
                            })
                            .then(() => {
                                return query(`
                                    UPDATE cacheversion
                                    SET version = version + 1
                                    WHERE type = 'TOPICS'
                                `)
                            })
                            .then(() => {
                                res.sendStatus(201);
                            })
                            .catch((err) => {
                                logger.error(`Inserting into db failed`);
                                logger.error(err);
                                res.status(500).send();
                            });
                    }
                }
            });
    } else if (!inputsValidation.valid) {
        res.sendStatus(400);
    } else if (!userObj.tokenObj.user.admin) {
        res.status(401).send();
    }

});