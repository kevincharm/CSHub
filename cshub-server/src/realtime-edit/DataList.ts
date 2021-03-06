import { IRealtimeEdit } from "../../../cshub-shared/src/api-calls/realtime-edit";
import { query } from "../db/database-query";
import logger from "../utilities/Logger";
import Delta = require("quill-delta/dist/Delta");
import { transformFromArray } from "../../../cshub-shared/src/utilities/DeltaHandler";
import async from "async";

interface QueueType {
    toAdd: IRealtimeEdit[];
    fullList: IRealtimeEdit[];
    isAsyncRunning: boolean;
}

export class DataList {
    private readonly editQueues: { [postId: number]: QueueType } = {};

    public addPost(postHash: number) {
        this.editQueues[postHash] = {
            toAdd: [],
            fullList: [],
            isAsyncRunning: false
        };
    }

    public addPostEdit(newEdit: IRealtimeEdit) {
        const queue = this.getTodoQueue(newEdit.postHash);

        if (queue === null) {
            this.addPost(newEdit.postHash);
            this.addPostEdit(newEdit);
        } else {
            queue.toAdd.push(newEdit);
            queue.fullList.push(newEdit);

            if (!queue.isAsyncRunning) {
                queue.isAsyncRunning = true;

                async.whilst(
                    () => queue.toAdd.length !== 0,
                    next => {
                        logger.verbose("Handling edit");
                        this.handleSave(next, queue);
                    },
                    () => {
                        queue.isAsyncRunning = false;
                    }
                );
            }

            if (queue.fullList.length > 10) {
                queue.fullList.splice(0, queue.fullList.length - 11);
            }
        }
    }

    private handleSave(next: () => void, queue: QueueType): void {
        const currRecord = queue.toAdd[0];

        new Promise(resolve => resolve())
            .then(() => {
                return query(
                    `
                  SELECT content, approved
                  FROM edits
                  WHERE post = (
                    SELECT id
                    FROM posts
                    WHERE hash = ?
                  )
                  ORDER BY datetime DESC
                  LIMIT 1
                `,
                    currRecord.postHash
                );
            })
            .then(lastEdit => {
                const isApproved = lastEdit.getLength() === 0 || lastEdit.getNumberFromDB("approved") === 1;

                try {
                    if (isApproved) {
                        return query(
                            `
                          INSERT INTO edits
                          SET post     = (
                            SELECT id
                            FROM posts
                            WHERE hash = ?
                          ),
                              content  = ?,
                              datetime = NOW()
                        `,
                            currRecord.postHash,
                            JSON.stringify(currRecord.delta)
                        ).then(() => {
                            if (currRecord.userId) {
                                return this.insertUserIntoEdit(currRecord.postHash, currRecord.userId);
                            }
                        });
                    } else {
                        const lastEditDelta = new Delta(JSON.parse(lastEdit.getStringFromDB("content")));
                        const toBeSavedEdit = lastEditDelta.compose(currRecord.delta ? currRecord.delta : new Delta());

                        return query(
                            `
                          UPDATE edits
                            INNER JOIN posts ON edits.post = posts.id
                          SET edits.content = ?
                          WHERE edits.approved = 0
                            AND posts.hash = ?
                          ORDER BY edits.datetime DESC
                          LIMIT 1
                        `,
                            JSON.stringify(toBeSavedEdit),
                            currRecord.postHash
                        ).then(() => {
                            if (currRecord.userId) {
                                return this.insertUserIntoEdit(currRecord.postHash, currRecord.userId);
                            }
                        });
                    }
                } catch (e) {
                    logger.error(
                        `Error with saving realtime edit (inserting), postHash: ${
                            queue.toAdd[0].postHash
                        }, delta: ${JSON.stringify(queue.toAdd[0].delta)}, queue:`
                    );
                    logger.error(JSON.stringify(queue));
                    logger.error(e);
                }
            })
            .then(() => {
                queue.toAdd.shift();
                logger.verbose(
                    `DONE inserting edit from time ${currRecord.timestamp} and user ${currRecord.userId} with id ${
                        currRecord.userGeneratedId
                    } and delta ${JSON.stringify(currRecord.delta)}`
                );
                next();
            });
    }

    private insertUserIntoEdit(postHash: number, userId: number) {
        return query(
            `
          INSERT INTO editusers
          SET editsId = (
            SELECT id
            FROM edits
            WHERE post = (
              SELECT id
              FROM posts
              WHERE hash = ?
            )
              AND approved = 0
          ),
              usersId = ?
          ON DUPLICATE KEY UPDATE usersId=usersId;
        `,
            postHash,
            userId
        ).catch(e => {
            logger.error("Inserting into edituser failed");
            logger.error(e);
            return;
        });
    }

    public transformArray(newEdit: IRealtimeEdit, newEditHasPriority: boolean): Delta {
        const editQueue = this.getEditQueue(newEdit.postHash);
        if (editQueue.length > 0) {
            const transformedDelta = transformFromArray(editQueue, newEdit, newEditHasPriority);
            if (transformedDelta) {
                return transformedDelta;
            }
        }
        return new Delta();
    }

    public getPreviousServerID(postHash: number): number {
        const currQueue = this.getEditQueue(postHash);
        if (currQueue.length === 0) {
            return -1;
        } else {
            const iRealtimeEdit = currQueue[currQueue.length - 1];
            return iRealtimeEdit.serverGeneratedId ? iRealtimeEdit.serverGeneratedId : -1;
        }
    }

    public getPreviousServerIDOfUser(edit: IRealtimeEdit): number {
        const currQueue = this.getEditQueue(edit.postHash);
        if (currQueue.length === 0) {
            return -1;
        } else {
            for (let i = currQueue.length - 1; i >= 0; i--) {
                if (currQueue[i].userId === edit.userId && currQueue[i].userGeneratedId === edit.prevUserGeneratedId) {
                    const serverGeneratedId = currQueue[i].serverGeneratedId;
                    return serverGeneratedId ? serverGeneratedId : -1;
                }
            }
            // Not possible
            logger.error("Edit has no valid parent");
            throw new TypeError("Impossible!");
        }
    }

    private getEditQueue(postHash: number): IRealtimeEdit[] {
        if (this.editQueues.hasOwnProperty(postHash)) {
            return this.editQueues[postHash].fullList;
        } else {
            this.addPost(postHash);
            return this.getEditQueue(postHash);
        }
    }

    private getTodoQueue(postHash: number): QueueType {
        if (this.editQueues.hasOwnProperty(postHash)) {
            return this.editQueues[postHash];
        } else {
            this.addPost(postHash);
            return this.getTodoQueue(postHash);
        }
    }
}
