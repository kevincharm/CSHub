import axios from 'axios'
import * as sha from 'sha.js'
import * as aws from 'aws-sdk'
import * as fs from 'fs'
import * as path from 'path'
import {
    GetPostContentCallBack,
    GetTopicsCallBack,
    GetStudiesCallback,
    PostVersionTypes,
    GetPostCallBack,
    VerifyUserTokenCallback,
} from '../../cshub-shared/src/api-calls/endpoints'
import { PostHashes } from '../../cshub-shared/src/api-calls/endpoints/posts'
import { ITopic } from '../../cshub-shared/src/entities/topic'
import { ApiDataMap } from './ApiDataMap'

const OUTPUT_FILENAME = path.resolve(__dirname, '../dist', 'api-data.json')
const DELAY_MS = 500
const API_BASE = 'https://api.cshub.nl'
const STUDY_ENDPOINT = new URL('study', API_BASE)
const TOPICS_ENDPOINT = new URL('topics', API_BASE)
const VERIFYTOKEN_ENDPOINT = new URL('verifytoken', API_BASE)

const spacesEndpoint = new aws.Endpoint('s3.eu-central-1.amazonaws.com')
const s3 = new aws.S3({
    endpoint: spacesEndpoint.href,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
})
const S3_BUCKET_NAME = 'cshub.spicyme.me'

async function scrape() {
    try {
        const data: ApiDataMap = {}

        const verifyTokenResponse: VerifyUserTokenCallback = {
            response: false,
        }
        data[VERIFYTOKEN_ENDPOINT.href] = JSON.stringify(verifyTokenResponse)

        // Fetch & record all studies
        const studiesResponse: GetStudiesCallback = await (await axios.get(STUDY_ENDPOINT.href))
            .data
        data[STUDY_ENDPOINT.href] = JSON.stringify(studiesResponse)

        for (const study of studiesResponse.studies) {
            await sleep(DELAY_MS)

            // Fetch & record topics for each study
            const topicsEndpoint = new URL('', TOPICS_ENDPOINT.href)
            topicsEndpoint.searchParams.set('studyNr', String(study.id))
            const topicsResponse: GetTopicsCallBack = await (await axios.get(topicsEndpoint.href))
                .data
            data[topicsEndpoint.href] = JSON.stringify(topicsResponse)

            Object.assign(data, await traverseTopicChildren(topicsResponse.topTopic))
        }

        const jsonData = JSON.stringify(data)
        fs.writeFileSync(OUTPUT_FILENAME, jsonData, { encoding: 'utf-8' })
    } catch (err) {
        console.error(err)
        if (err.response) {
            console.error(err.response)
        }
    }
}

async function upload() {
    try {
        const data: ApiDataMap = JSON.parse(fs.readFileSync(OUTPUT_FILENAME, { encoding: 'utf-8' }))
        for (const endpoint in data) {
            const escapedEndpoint = sha('sha256').update(endpoint).digest('hex')
            console.log(`Uploading: ${escapedEndpoint}`)
            await s3
                .upload({
                    Bucket: S3_BUCKET_NAME,
                    Key: escapedEndpoint,
                    Body: JSON.stringify(data[endpoint]),
                    ContentType: 'application/json',
                    ACL: 'public-read',
                })
                .promise()
        }
    } catch (err) {
        console.log(err)
    }
}

async function traverseTopicChildren(topic: ITopic): Promise<ApiDataMap> {
    const data: ApiDataMap = {}

    await sleep(DELAY_MS)

    // Fetch posts for current topic
    const topicPostsEndpoint = new URL(`posts/${topic.hash}`, API_BASE)
    const topicPostsResponse: PostHashes = await (await axios.get(topicPostsEndpoint.href)).data
    data[topicPostsEndpoint.href] = JSON.stringify(topicPostsResponse)
    // Fetch example (???)
    const topicPostsExampleEndpoint = new URL(`posts/${topic.hash}/example`, API_BASE)
    const topicPostsExampleResponse: PostHashes = await (
        await axios.get(topicPostsExampleEndpoint.href)
    ).data
    data[topicPostsExampleEndpoint.href] = JSON.stringify(topicPostsExampleResponse)

    // Fetch each post hash
    for (const topicHash of topicPostsResponse.postHashes) {
        await sleep(DELAY_MS)

        const postEndpoint = new URL(`post/${topicHash}`, API_BASE)
        const postResponse: GetPostCallBack = await (await axios.get(postEndpoint.href)).data
        data[postEndpoint.href] = JSON.stringify(postResponse)

        // Fetch post content
        const postContentEndpoint = new URL(`post/${topicHash}/content`, API_BASE)
        const postContentResponse: GetPostContentCallBack = await (
            await axios.get(postContentEndpoint.href)
        ).data
        data[postContentEndpoint.href] = JSON.stringify(postContentResponse)

        // Log what we fetched to keep track
        if (postContentResponse.data.type === PostVersionTypes.UPDATEDPOST) {
            console.log(
                postResponse.post.title +
                    ' --> ' +
                    postContentResponse.data.content.html.slice(0, 100)
            )
        }
    }

    // Traverse children if needed
    for (const child of topic.children) {
        await sleep(DELAY_MS)

        Object.assign(data, await traverseTopicChildren(child))
    }

    return data
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
    await scrape()
    await upload()
}

main()
