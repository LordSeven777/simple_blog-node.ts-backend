import { Request, Response, NextFunction } from "express";
import { FilterQuery, Document, Types } from "mongoose";

// App error class
import AppError from "../@types/AppError-class";

// Paginated find
import paginatedFind from "../helpers/paginatedFind-helper";

// Models
import PostModel, { PostAttributes } from "../models/post-model";
import CategoryModel, { CategoryAttributes } from "../models/category-model";

// Posts photos config
import { postsPhotoConfig } from "../configs/photos-config";

// Class for posts controller
class PostsController {

    // Gets posts under pagination *****************************************************
    static async getPaginatedPosts(req: Request, res: Response, next: NextFunction) {
        try {
            const page = req.query.page ? parseInt(req.query.page as string) : 1;
            const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
            const filter: FilterQuery<PostAttributes> = {
                title: new RegExp(decodeURI(req.query.search as string), "i")
            }
            const projection = "-categories";
            const paginatedPosts = await paginatedFind<PostAttributes>(PostModel, page, limit, { filter, projection });
            res.json(paginatedPosts);
        }
        catch (error) {
            next(error);
        }
    }


    // Gets a post *********************************************************************
    static async getPost(req: Request, res: Response, next: NextFunction) {
        try {
            const post = await PostModel.findById(req.params.postId).populate("author", "_id firstName lastName gender photoPath").populate("categories", "-posts");
            if (!post) return next(new AppError(404, "The post is not found"));
            res.json(post);
        }
        catch (error) {
            next(error);
        }
    }


    // Adds a post *********************************************************************
    static async addPost(req: Request, res: Response, next: NextFunction) {
        try {
            const { userId } = res.locals.authUser;
            const photoFilename = req.file?.filename;

            // Creating the new post document
            const post = new PostModel({
                title: req.body.title,
                content: req.body.content,
                photoPath: `${postsPhotoConfig.urlPath}/${photoFilename}`,
                author: userId
            });

            // Checks if there are new categories that already exist
            const checkExistingNewCategories = await Promise.allSettled((req.body.newCategories as string[]).map(label => {
                return CategoryModel.findOne({ label: new RegExp(label, "i") });
            }));
            // Distinguishing the already existing categories and the non-existing ones
            const existingCategories: Types.ObjectId[] = [];
            const nonExistingCategories: string[] = [];
            checkExistingNewCategories.forEach((result, i) => {
                if (result.status === "fulfilled") {
                    if (result.value) existingCategories.push(result.value._id);
                    else nonExistingCategories.push(req.body.newCategories[i]);
                }
                else nonExistingCategories.push(req.body.newCategories[i]);
            });
            // Storing the non-existing categories
            const addedCategories = await CategoryModel.insertMany(nonExistingCategories.map(label => ({ label, posts: [post._id] })));

            // Setting the final categories for the post
            post.categories = [... new Set<Types.ObjectId>([...(req.body.categories as Types.ObjectId[]), ...existingCategories]), ...addedCategories.map(({ _id }) => _id)];

            // Saving the post to db
            await post.save();

            res.send(post);
        }
        catch (error) {
            next(error);
        }
    }

}

export default PostsController;