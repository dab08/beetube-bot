const _ = require("lodash");
const axios = require("axios");
const Provider = require(".");
const Paginator = require("../models/paginator");
const keyboardMarkup = require("../utils/keyboard");
const errorHandler = require("../utils/error-handler");

module.exports = class Anime extends Provider {
	constructor(bot) {
		super(bot);
		this.type = "anime";
		this.endpoint = process.env.MOVIE_API;
	}

	/**
	 * List anime
	 * @param  {} message
	 * @param  {} page=1
	 */
	async list({ chat }, page = 1) {
		const { message_id } = await this.bot.sendMessage(
			chat.id,
			"\u{1F504} Fetching anime \u{1F4E1}",
			keyboardMarkup
		);

		await this.bot.sendChatAction(chat.id, "upload_video");
		const { data } = await axios.get(`${this.endpoint}/list`, {
			params: { page, engine: "animeout" },
		});
		const options = { parse_mode: "html" };

		_.map(data, (anime, i) => {
			const isLastItem = data.length - 1 === i;
			/*
			 * Ensure all messages are sent before pagination
			 */
			setTimeout(
				async () => {
					const pagination = isLastItem
						? [
								{
									text: "Next",
									callback_data: JSON.stringify({
										type: `paginate_${this.type}`,
										page: page + 1,
									}),
								},
						  ]
						: [];

					if (page > 1 && pagination.length > 0) {
						pagination.unshift({
							text: "Previous",
							callback_data: JSON.stringify({
								type: `paginate_${this.type}`,
								page: page - 1,
							}),
						});
					}

					options.reply_markup = JSON.stringify({
						inline_keyboard: [
							[
								{
									text: "\u{2B07} Download",
									url: anime.DownloadLink,
								},
							],
							pagination,
						],
					});

					const description = anime.Description
						? "\n\n<b>Description:</b> " + anime.Description
						: "";
					const msg = await this.bot.sendMessage(
						chat.id,
						`<a href="${anime.CoverPhotoLink}">\u{1F3A1}</a> <b>${anime.Title}</b>${description}`,
						options
					);

					await new Paginator({
						_id: msg.message_id,
						type: this.type,
						user: msg.chat.id,
					}).save();
				},
				isLastItem ? 2500 : 0
			);
		});

		await this.bot.deleteMessage(chat.id, message_id);
	}

	/**
	 * Search for movies
	 * @param  {} message
	 * @param  {} params
	 */
	async search({ chat }, params) {
		const { message_id } = await this.bot.sendMessage(
			chat.id,
			`\u{1F504} Searching for \`${params.query}\` \u{1F4E1}`,
			keyboardMarkup
		);

		await this.bot.sendChatAction(chat.id, "upload_video");
		const { data } = await axios.get(`${this.endpoint}/search`, {
			params: {
				query: params.query.replace(" ", "+"),
				engine: "animeout",
			},
		});
		const options = { parse_mode: "html" };

		_.map(data, async anime => {
			options.reply_markup = JSON.stringify({
				inline_keyboard: [
					[{ text: "\u{2B07} Download", url: anime.DownloadLink }],
				],
			});

			const description = anime.Description
				? "\n\n<b>Description:</b> " + anime.Description
				: "";
			await this.bot.sendMessage(
				chat.id,
				`<a href="${anime.CoverPhotoLink}">\u{1F3A1}</a> <b>${anime.Title}</b>${description}`,
				options
			);
		});

		await this.bot.deleteMessage(chat.id, message_id);
	}

	/**
	 * Interactive search
	 * @param  {} message
	 */
	async interactiveSearch(message) {
		const chatId = message.chat.id;
		const { message_id } = await this.bot.sendMessage(
			chatId,
			"\u{1F50D} Tell me the title of the anime you want",
			{ reply_markup: JSON.stringify({ force_reply: true }) }
		);

		const listenerId = this.bot.onReplyToMessage(
			chatId,
			message_id,
			async reply => {
				this.bot.removeReplyListener(listenerId);
				await this.search(message, { query: reply.text });
			}
		);
	}

	/**
	 * Task resolver
	 * @param  {} data
	 * @param  {} message
	 */
	async resolve(data, message) {
		try {
			switch (data.type) {
				case `list_${this.type}`:
					await this.list(message);
					break;
				case `paginate_${this.type}`:
					await this.paginate(message, data.page, "list");
					break;
				case `search_${this.type}`:
					await this.interactiveSearch(message);
					break;
			}
		} catch (error) {
			await errorHandler(this.bot, message.chat.id, error);
		}
	}
};