import Vue from "vue";
import Router, {Route} from "vue-router";

import {VerifyUserToken, VerifyUserTokenCallback, VerifyUserTokenResponseTypes} from "../../../../cshub-shared/api-calls/account";

const LoginScreen = () => import("../user/LoginScreen.vue");
const CreateAccount = () => import("../user/CreateUserAccount.vue");
const AdminDashboard = () => import("../user/AdminDashboard.vue");
const UserDashboard = () => import("../user/UserDashboard.vue");

const PostView = () => import("../posts/PostView.vue");
const PostCreate = () => import("../posts/PostCreate.vue");
const PostsSearch = () => import("../posts/PostsSearch.vue");

const Quill = () => import("../../components/quill/Quill.vue");

import {userBeforeEnter} from "./guards/userDashboardGuard";
import {adminBeforeEnter} from "./guards/adminDashboardGuard";
import {onlyIfNotLoggedIn} from "./guards/onlyIfNotLoggedInGuard";

import {adminChildrenRoutes} from "./adminRoutes";

import userState from "../../store/user";
import dataState from "../../store/data";

import {ApiWrapper, logStringConsole} from "../../utilities";
import {AxiosError} from "axios" ;

Vue.use(Router);

export class Routes {
    public static readonly INDEX: string = "/";
    public static readonly LOGIN = "/login";
    public static readonly EDITOR = "/editor";
    public static readonly CREATEACCOUNT = "/createaccount";
    public static readonly POST = "/post";
    public static readonly POSTCREATE = "/post/create";
    public static readonly TOPIC = "/topic";
    public static readonly USERDASHBOARD = "/user";
    public static readonly ADMINDASHBOARD = "/admin";
    public static readonly SEARCH = "/search";
}

const router = new Router({
    mode: "history",
    base: process.env.BASE_URL,
    routes: [
        {
            path: Routes.INDEX,
            name: "index",
            component: PostView
        },
        {
            path: Routes.LOGIN,
            name: "login",
            component: LoginScreen,
            beforeEnter: onlyIfNotLoggedIn
        },
        {
            path: Routes.CREATEACCOUNT,
            name: "createaccount",
            component: CreateAccount,
            beforeEnter: onlyIfNotLoggedIn
        },
        {
            path: Routes.POSTCREATE,
            name: "postcreate",
            component: PostCreate,
            beforeEnter: userBeforeEnter
        },
        {
            path: `${Routes.POST}/:hash`,
            name: "post",
            component: PostView
        },
        {
            path: `${Routes.POST}/:hash/edit`,
            name: "postEdit",
            component: PostView
        },
        {
            path: `${Routes.POST}/:hash/edits`,
            name: "postEdits",
            component: PostView
        },
        {
            path: Routes.EDITOR, // TODO: Same as import
            name: "editor",
            component: Quill
        },
        {
            path: `${Routes.TOPIC}/:hash`,
            name: "topic",
            component: PostView
        },
        {
            path: Routes.SEARCH,
            name: "search",
            component: PostsSearch
        },
        {
            path: Routes.USERDASHBOARD,
            name: "user",
            component: UserDashboard,
            beforeEnter: userBeforeEnter
        },
        {
            path: Routes.ADMINDASHBOARD,
            name: "admin",
            component: AdminDashboard,
            beforeEnter: adminBeforeEnter,
            children: adminChildrenRoutes
        }
    ],
});

router.beforeEach((to: Route, from: Route, next) => {

    if (!userState.hasCheckedToken) {
        ApiWrapper.sendGetRequest(new VerifyUserToken(), (verified: VerifyUserTokenCallback) => {

            if (!dataState.hasConnection) {
                dataState.setConnection(true);
            }

            if (verified.response === VerifyUserTokenResponseTypes.VALID) {
                logStringConsole("User is logged in", "isLoggedIn after API");
                userState.changeUserModel(verified.userModel);
            } else {
                logStringConsole("User is not logged in", "isLoggedIn after API");
            }
            next();
            userState.setCheckedToken();

        }, (err: AxiosError) => {
            dataState.setConnection(false);
            next();
        });
    } else {
        next();
    }

});

export default router;
