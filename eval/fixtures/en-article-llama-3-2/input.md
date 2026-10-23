![Meta](https://scontent-cdg4-1.xx.fbcdn.net/v/t39.8562-6/252294889_575082167077436_6034106545912333281_n.svg/meta-logo-primary_standardsize.svg?_nc_cat=108&ccb=1-7&_nc_sid=e280be&_nc_ohc=hAHazKbORSwQ7kNvwHfoJj9&_nc_oc=AdrcahYRZI-LCul0ZQ-9q8kzdAOo_FC2E2PHrT3-XoSU4NSVsQHmryfCqy_58Uk2FkeKEJqjH2WhknGHeqDEiU9X&_nc_zt=14&_nc_ht=scontent-cdg4-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQOpixfJogXIyeBGQf8vrR3FsilGs3pFG3qeCeSsotOttw&oe=6AD41779)

- Products
- AI Research
- Resources
- About
- [AI Developers](https://developer.meta.com/ai/?utm_source=ai_meta_site&utm_medium=web&utm_campaign=nav_AI-developers_07242026&utm_content=nav_AI-developers)
- [Try Muse](https://applink.muse.ai/?pt=10684&pid=ai_meta_site&utm_source=ai_meta_site&utm_medium=web&utm_campaign=nav_try-muse_09082026&utm_content=nav_try-muse_09082026&ct=nav_try-muse_09082026&referrer=utm_source%3Dai_meta_site%26utm_medium%3Dweb%26utm_campaign%3Dnav_try-muse_09082026%26utm_content%3Dnav_try-muse_09082026)

FEATURED

Large Language Model

# Llama 3.2: Revolutionizing edge AI and vision with open, customizable models

September 25, 2024•

15 minute read

![](https://scontent-cdg6-1.xx.fbcdn.net/v/t39.2365-6/461179924_892945479558448_4846394290454647920_n.png?_nc_cat=105&ccb=1-7&_nc_sid=e280be&_nc_ohc=FKJfL0Yt_gYQ7kNvwG0LLJ_&_nc_oc=AdoyXvY8J_gKl2V6panshkYDXgl7mHqwW48aIMZAgBNFuRGsMHmBYpahO3WRCAx6PUP7ZlVeF9u-MiGyvUaFd9OW&_nc_zt=14&_nc_ht=scontent-cdg6-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQP11EKeEzd9-D1VupvIaBx99tWtRa06ux6YCdMc0qTsMw&oe=6AE89190)

## Takeaways:

* Today, we’re releasing Llama 3.2, which includes small and medium-sized vision LLMs (11B and 90B), and lightweight, text-only models (1B and 3B) that fit onto edge and mobile devices, including pre-trained and instruction-tuned versions.
* The Llama 3.2 1B and 3B models support context length of 128K tokens and are state-of-the-art in their class for on-device use cases like summarization, instruction following, and rewriting tasks running locally at the edge. These models are enabled on day one for Qualcomm and MediaTek hardware and optimized for Arm processors.
* Supported by a broad ecosystem, the Llama 3.2 11B and 90B vision models are drop-in replacements for their corresponding text model equivalents, while exceeding on image understanding tasks compared to closed models, such as Claude 3 Haiku. Unlike other open multimodal models, both pre-trained and aligned models are available to be fine-tuned for custom applications using torchtune and deployed locally using torchchat. They’re also available to try using our smart assistant, Meta AI.
* We’re sharing the first official [<u>Llama Stack</u>](https://github.com/meta-llama/llama-stack) distributions, which will greatly simplify the way developers work with Llama models in different environments, including single-node, on-prem, cloud, and on-device, enabling turnkey deployment of retrieval-augmented generation (RAG) and tooling-enabled applications with integrated safety.
* We’ve been working closely with partners like AWS, Databricks, Dell Technologies, Fireworks, Infosys, and Together AI to build Llama Stack distributions for their downstream enterprise clients. On-device distribution is via PyTorch [<u>ExecuTorch</u>](https://github.com/pytorch/executorch), and single-node distribution is via Ollama.
* We continue to share our work because we believe [<u>openness drives innovation and is good for developers, Meta, and the world</u>](https://about.fb.com/news/2024/07/open-source-ai-is-the-path-forward/). Llama is already leading the way on openness, modifiability, and cost efficiency—enabling more people to have creative, useful, and life-changing breakthroughs using generative AI.
* We’re making Llama 3.2 models available for download on [<u>llama.com</u>](https://llama.meta.com/) and [<u>Hugging Face</u>](https://huggingface.co/meta-llama), as well as available for immediate development on our broad ecosystem of partner platforms, including AMD, AWS, Databricks, Dell, Google Cloud, Groq, IBM, Intel, Microsoft Azure, NVIDIA, Oracle Cloud, Snowflake, and more.

We’ve been excited by the [<u>impact the Llama 3.1 herd of models have made</u>](https://ai.meta.com/blog/llama-usage-doubled-may-through-july-2024/) in the two months since we announced them, including the [<u>405B</u>](https://www.meta.ai/?utm_source=llama_meta_site&utm_medium=web&utm_content=Llama_nav&utm_campaign=July_moment)—the first open frontier-level AI model. While these models are incredibly powerful, we recognize that building with them requires significant compute resources and expertise. We’ve also heard from developers who don’t have access to these resources and still want the opportunity to build with Llama. As Meta Founder and CEO Mark Zuckerberg shared today at Connect, they won’t have to wait any longer. Today, we’re releasing Llama 3.2, which includes small and medium-sized vision LLMs (11B and 90B) and lightweight, text-only models (1B and 3B) that fit onto select edge and mobile devices.

It’s only been a year and a half since we first announced Llama, and we’ve made incredible progress in such a short amount of time. This year, [<u>Llama has achieved 10x growth</u>](https://ai.meta.com/blog/llama-usage-doubled-may-through-july-2024/) and become the standard for responsible innovation. Llama also continues to lead on openness, modifiability, and cost efficiency, and it’s competitive with closed models—even leading in some areas. We believe that openness drives innovation and is the right path forward, which is why we continue to share our research and collaborate with our partners and the developer community.

We’re making Llama 3.2 models available for download on [<u>llama.com</u>](https://llama.meta.com/) and [<u>Hugging Face</u>](https://huggingface.co/meta-llama), as well as available for immediate development on our broad ecosystem of partner platforms. Partners are an important part of this work, and we’ve worked with over 25 companies, including AMD, AWS, Databricks, Dell, Google Cloud, Groq, IBM, Intel, Microsoft Azure, NVIDIA, Oracle Cloud, and Snowflake, to enable services on day one. For the Llama 3.2 release, we’re also working with on-device partners Arm, MediaTek, and Qualcomm to offer a broad range of services at launch. Starting today, we’re also making [<u>Llama Stack</u>](https://github.com/meta-llama/llama-stack) available to the community. More details on the latest release, including information on the [<u>multimodal availability</u>](https://euneedsai.com/) in Europe, can be found in [<u>our acceptable use policy</u>](https://github.com/meta-llama/llama-models/blob/main/models/llama3_2/USE_POLICY.md).

## Meet Llama 3.2

The two largest models of the Llama 3.2 collection, 11B and 90B, support image reasoning use cases, such as document-level understanding including charts and graphs, captioning of images, and visual grounding tasks such as directionally pinpointing objects in images based on natural language descriptions. For example, a person could ask a question about which month in the previous year their small business had the best sales, and Llama 3.2 can then reason based on an available graph and quickly provide the answer. In another example, the model could reason with a map and help answer questions such as when a hike might become steeper or the distance of a particular trail marked on the map. The 11B and 90B models can also bridge the gap between vision and language by extracting details from an image, understanding the scene, and then crafting a sentence or two that could be used as an image caption to help tell the story.

The lightweight 1B and 3B models are highly capable with multilingual text generation and tool calling abilities. These models empower developers to build personalized, on-device agentic applications with strong privacy where data never leaves the device. For example, such an application could help summarize the last 10 messages received, extract action items, and leverage tool calling to directly send calendar invites for follow-up meetings.

Running these models locally comes with two major advantages. First, prompts and responses can feel instantaneous, since processing is done locally. Second, running models locally maintains privacy by not sending data such as messages and calendar information to the cloud, making the overall application more private. Since processing is handled locally, the application can clearly control which queries stay on the device and which may need to be processed by a larger model in the cloud.

## Model evaluations

Our evaluation suggests that the Llama 3.2 vision models are competitive with leading foundation models, Claude 3 Haiku and GPT4o-mini on image recognition and a range of visual understanding tasks. The 3B model outperforms the Gemma 2 2.6B and Phi 3.5-mini models on tasks such as following instructions, summarization, prompt rewriting, and tool-use, while the 1B is competitive with Gemma.

We evaluated performance on over 150 benchmark datasets that span a wide range of languages. For the vision LLMs, we evaluated performance on benchmarks for image understanding and visual reasoning.

![](https://scontent-cdg4-1.xx.fbcdn.net/v/t39.2365-6/461288018_1255239495501495_271827633811450582_n.png?_nc_cat=102&ccb=1-7&_nc_sid=e280be&_nc_ohc=FuDaFsBZ58IQ7kNvwFIuNQJ&_nc_oc=AdrCgkCua-4swicUWz8StNzQZaA_JtKVib4knAYkOu5yuBbUSAuDzDIL8vUhJgXzZ37fJjbplXPfJT_zR7GxRhHl&_nc_zt=14&_nc_ht=scontent-cdg4-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQPihO3s7_i-SgtS2G1Z7XSLZihHLAHW7p7ULo2EV6WJXw&oe=6AE895ED)![](https://scontent-cdg4-2.xx.fbcdn.net/v/t39.2365-6/461157789_931406385491961_1692349435372036848_n.png?_nc_cat=100&ccb=1-7&_nc_sid=e280be&_nc_ohc=6l4x7uFXGLYQ7kNvwGGlgto&_nc_oc=Adrxxnp95oqBsmz1IAhLWcNyNq1Ytt2D62nUiMru9kArNv-0RE43dlSqd2sjIxstq2GrIXOEftwt27PJW50LcISZ&_nc_zt=14&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQMrtuL4TvI9qFHM8txGyfwVGTih1cFBkniuXNAZjfy5Jw&oe=6AE87518)

## Vision models

As the first Llama models to support vision tasks, the 11B and 90B models required an entirely new model architecture that supports image reasoning.

To add image input support, we trained a set of adapter weights that integrate the pre-trained image encoder into the pre-trained language model. The adapter consists of a series of cross-attention layers that feed image encoder representations into the language model. We trained the adapter on text-image pairs to align the image representations with the language representations. During adapter training, we also updated the parameters of the image encoder, but intentionally did not update the language-model parameters. By doing that, we keep all the text-only capabilities intact, providing developers a drop-in replacement for Llama 3.1 models.

Our training pipeline consists of multiple stages, starting from pretrained Llama 3.1 text models. First, we add image adapters and encoders, then pretrain on large-scale noisy (image, text) pair data. Next, we train on medium-scale high quality in-domain and knowledge-enhanced (image, text) pair data.

In post-training, we use a similar recipe as the text models by doing several rounds of alignment on supervised fine-tuning, rejection sampling, and direct preference optimization. We leverage synthetic data generation by using the Llama 3.1 model to filter and augment question and answers on top of in-domain images, and use a reward model to rank all the candidate answers to provide high quality fine-tuning data. We also add safety mitigation data to produce a model with a high level of safety while retaining helpfulness of the mode

The end result is a set of models that can take in both image and text prompts, and deeply understand and reason on the combination. This is another step toward Llama models having even richer agentic capabilities.

[![](https://scontent-cdg4-1.xx.fbcdn.net/v/t15.5256-10/461056114_513962811237812_8614398012684914528_n.jpg?_nc_cat=108&ccb=1-7&_nc_sid=b07905&_nc_ohc=Gwc8flRTQa0Q7kNvwH8BbKM&_nc_oc=AdruQnNN7RDMpUn2cB2EcbC-dHbHnb6SCAsUgCnWuG01VxWmDLnxXZteI5IkDq9vKyB2bpRQIJAzmoUaMcSR91qV&_nc_zt=23&_nc_ht=scontent-cdg4-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQN5PlEWEa2ppYllJkiaWj0IPCgvkHs9r9lRaz5W_H4tbA&oe=6AD4157F)](https://video-cdg4-2.xx.fbcdn.net/o1/v/t2/f2/m412/AQP48GAubKyNsS2I1UIdtLDFMA23D4vZrg00eQUyeDikVXkpxci9dvuhnVCXDHbncFEsGp-3MaUJhP49qTJK6g.mp4?_nc_cat=101&_nc_sid=8bf8fe&_nc_ht=video-cdg4-2.xx.fbcdn.net&_nc_ohc=h34BXkvl0ZMQ7kNvwFdURX-&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5GQUNFQk9PSy4uQzMuNTAwLnN2ZV9zZCIsInhwdl9hc3NldF9pZCI6MjIwNTA4MDAyOTg5MDk3NCwiYXNzZXRfYWdlX2RheXMiOjc0OSwidmlfdXNlY2FzZV9pZCI6MTAxMjgsImR1cmF0aW9uX3MiOjM0LCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&_nc_zt=28&oh=00_AQOUjwbL71fkOyhMxrPbRbU9ff9Hwk8n_38amMUp4KuJFQ&oe=6AD43237&bitrate=142141&tag=sve_sd)

## Lightweight models

As we talked about with Llama 3.1, powerful teacher models can be leveraged to create smaller models that have improved performance. We used two methods—pruning and distillation—on the 1B and 3B models, making them the first highly capable lightweight Llama models that can fit on devices efficiently.

Pruning enabled us to reduce the size of extant models in the Llama herd while recovering as much knowledge and performance as possible. For the 1B and 3B models, we took the approach of using structured pruning in a single shot manner from the Llama 3.1 8B. This involved systematically removing parts of the network and adjusting the magnitude of the weights and gradients to create a smaller, more efficient model that retains the performance of the original network.

Knowledge distillation uses a larger network to impart knowledge on a smaller network, with the idea that a smaller model can achieve better performance using a teacher than it could from scratch. For the 1B and 3B in Llama 3.2, we incorporated logits from the Llama 3.1 8B and 70B models into the pre-training stage of the model development, where outputs (logits) from these larger models were used as token-level targets. Knowledge distillation was used after pruning to recover performance.

![](https://scontent-cdg4-2.xx.fbcdn.net/v/t39.2365-6/461209081_511117684875670_45564063096782202_n.png?_nc_cat=101&ccb=1-7&_nc_sid=e280be&_nc_ohc=Lr26LOuQD70Q7kNvwHKp1o4&_nc_oc=AdrDCq5H6bj93e0UK1VeYj4hDvEONeuyyu8dKECdV_q0Nuo4X_SbdzlkAeSd_kEuENcou-kRkA5t5R2N39kl1mIv&_nc_zt=14&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQMAfCVLrGisMKPkrRSN7-t56KGVE2teD9axADIiv25b9A&oe=6AE8955E)

In post-training, we use a similar recipe as Llama 3.1 and produce final chat models by doing several rounds of alignment on top of the pre-trained model. Each round involves supervised fine-tuning (SFT), rejection sampling (RS), and direct preference optimization (DPO).

In post-training, we scale context length support to 128K tokens, while maintaining the same quality as the pre-trained model. We also engage in synthetic data generation that goes through careful data processing and filtering to ensure high quality. We carefully blend the data to optimize for high quality across multiple capabilities like summarization, rewriting, instruction following, language reasoning, and tool use.

To enable the community to innovate on these models, we worked closely with Qualcomm and Mediatek, the top two mobile system on a chip (SoC) companies in the world, and Arm, who provides the foundational compute platform for [<u>99</u>](https://www.arm.com/company)[%](https://www.arm.com/company) of mobile devices. The weights being released today are based on BFloat16 numerics. Our teams are actively exploring quantized variants that will run even faster, and we hope to share more on that soon.

[![](https://scontent-cdg4-2.xx.fbcdn.net/v/t15.5256-10/461175777_1232835904725128_2221758518972028631_n.jpg?_nc_cat=101&ccb=1-7&_nc_sid=b07905&_nc_ohc=D074uA0AVOAQ7kNvwEe52N_&_nc_oc=AdqOugruxZNwxpKhuIj_7-j2NGZ_ypxGncOvzb65FoYodd-QGSMdo7iNnNryRKKq40bzP8JyEX7vSkogUaKtmAkA&_nc_zt=23&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQMNRB4JI8l98QBV99DYtdzeDauVOZfEpK0DyQ7q4bHiVQ&oe=6AD42DB2)](https://video-cdg4-1.xx.fbcdn.net/o1/v/t2/f2/m412/AQNM89DYNjoBhHGjwb-A7Mm8AFX0JfHSC3BYxBLDmG9wOsnr46rWj5OUBp15ZS-wfIGrKht_mbFAWiIQbl21QnBu.mp4?_nc_cat=102&_nc_sid=8bf8fe&_nc_ht=video-cdg4-1.xx.fbcdn.net&_nc_ohc=Vej3bqgzMaYQ7kNvwGHmOUR&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5GQUNFQk9PSy4uQzMuNjA2LnN2ZV9zZCIsInhwdl9hc3NldF9pZCI6ODUwODg3MDAwNDY3NDcyLCJhc3NldF9hZ2VfZGF5cyI6NzQ4LCJ2aV91c2VjYXNlX2lkIjoxMDEyOCwiZHVyYXRpb25fcyI6MTgsInVybGdlbl9zb3VyY2UiOiJ3d3cifQ%3D%3D&ccb=17-1&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&_nc_zt=28&oh=00_AQO7v-g-OsQ0bIFJHJFKMNPqbDhSDPoIt8WvsiHDCkZIYw&oe=6AD406BB&bitrate=150123&tag=sve_sd)

[![](https://scontent-cdg4-2.xx.fbcdn.net/v/t15.5256-10/461266248_500239006240707_7896476132563198179_n.jpg?_nc_cat=109&ccb=1-7&_nc_sid=b07905&_nc_ohc=54MGVHXEPwgQ7kNvwE_5giU&_nc_oc=AdoRwGMwXfg2A8ekD1qbuMnlVT8s87gjMSxsrOAiRjf4RA_VKncO-ZAdr9wqG3tMybbWZPCr6XNwJefQE36Mt7cd&_nc_zt=23&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQPjD-CPoCcHoqVkNa_6Kht_X-wSzalmSXIUQhaje3HBFg&oe=6AD4136F)](https://video-cdg6-1.xx.fbcdn.net/o1/v/t2/f2/m412/AQM8dK4B9St01fPz48I-NHXmzlZLeWFwS7H1gwqOMEq3BIw_jJT3-IU4H9fpohhJb6uZlqVWZyunfwiDZnXLNg.mp4?_nc_cat=106&_nc_sid=8bf8fe&_nc_ht=video-cdg6-1.xx.fbcdn.net&_nc_ohc=atkf1DWqwUIQ7kNvwHsRIaR&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5GQUNFQk9PSy4uQzMuNjA2LnN2ZV9zZCIsInhwdl9hc3NldF9pZCI6MjgxNDY5NDA4ODgyOTg3MywiYXNzZXRfYWdlX2RheXMiOjc0OCwidmlfdXNlY2FzZV9pZCI6MTAxMjgsImR1cmF0aW9uX3MiOjIxLCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&_nc_zt=28&oh=00_AQN2ejAU5fg0YbpcDzKF5V3TwDNuI01nLTnxL-XkqO2Xfg&oe=6AD4263E&bitrate=142682&tag=sve_sd)

This demo is based on an unreleased quantized model.

[![](https://scontent-cdg4-2.xx.fbcdn.net/v/t15.5256-10/460968799_1051568729954907_4307399417507307983_n.jpg?_nc_cat=100&ccb=1-7&_nc_sid=b07905&_nc_ohc=5ctvzVZbru8Q7kNvwFY9dpb&_nc_oc=AdqnvkDHYEyT-iXr3gknGMTK2LeWJUxh2O90k1VDir_8vUyqpco6VF-6V2qaFErHI_dozk4DNsWWPWsqyCK0Xvc-&_nc_zt=23&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQMmeymX3JkFdXa6peWTiPTYJcChSevFET6Yl4yhKU2esQ&oe=6AD42B72)](https://video-cdg4-1.xx.fbcdn.net/o1/v/t2/f2/m412/AQN6ex7Z2jZosbpYqCff1SI6BVX97ihjGshAKKrxA7Cy6trq-ucBRLBK95dNDz4DhvU_5av5d_Vnb6WeCL2TLgjA.mp4?_nc_cat=104&_nc_sid=8bf8fe&_nc_ht=video-cdg4-1.xx.fbcdn.net&_nc_ohc=-5IoDd4hf0kQ7kNvwGcilMy&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5GQUNFQk9PSy4uQzMuNDI2LnN2ZV9zZCIsInhwdl9hc3NldF9pZCI6Mzk2MzE1MTE2NjM5MDI2LCJhc3NldF9hZ2VfZGF5cyI6NzQ5LCJ2aV91c2VjYXNlX2lkIjoxMDEyOCwiZHVyYXRpb25fcyI6MTYsInVybGdlbl9zb3VyY2UiOiJ3d3cifQ%3D%3D&ccb=17-1&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&_nc_zt=28&oh=00_AQPJZc6utmkNxnw_1cVO449bNUT_ssnigP3Ot14oOxWMiQ&oe=6AD40B51&bitrate=125801&tag=sve_sd)

This demo is based on an unreleased quantized model.

## Llama Stack distributions

In July, we released a request for comment on the Llama Stack API, a standardized interface for canonical toolchain components (fine-tuning, synthetic data generation) to customize Llama models and build agentic applications. The engagement has been great.

Since then, we have been working hard to make the API real. We built a reference implementation of the APIs for inference, tool use, and RAG. In addition, we have been working with partners to adapt them to become providers for the APIs. Finally, we have introduced Llama Stack Distribution as a way to package multiple API Providers that work well together to provide a single endpoint for developers. We are now sharing with the community a simplified and consistent experience that will enable them to work with Llama models in multiple environments, including on-prem, cloud, single-node, and on-device.

![](https://scontent-cdg4-2.xx.fbcdn.net/v/t39.2365-6/460924239_3402957093334534_4357083070437107157_n.png?_nc_cat=109&ccb=1-7&_nc_sid=e280be&_nc_ohc=FDoZknuKOckQ7kNvwHPOxD4&_nc_oc=AdpxmDVqPvsygJWJo_N9xFtSjOM_zPSRTcwQQyv16BYEwKoOgrXp_v0wGAG5Z7WkwRmYba2S-qKxb0BvBHwoy_mS&_nc_zt=14&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQPIKpYXCXyYdeBbMmaGmo3DsbV5RufK9dOH7zoyEmVBIQ&oe=6AE877A0)

The full set of releases includes:

1. Llama CLI (command line interface) to build, configure, and run Llama Stack distributions
2. Client code in multiple languages, including python, node, kotlin, and swift
3. Docker containers for Llama Stack Distribution Server and Agents API Provider
4. Multiple distributions
   1. Single-node Llama Stack Distribution via Meta internal implementation and Ollama
   2. Cloud Llama Stack distributions via AWS, Databricks, Fireworks, and Together
   3. On-device Llama Stack Distribution on iOS implemented via PyTorch ExecuTorch
   4. On-prem Llama Stack Distribution supported by Dell

We look forward to working with developers and partners to simplify all aspects of building with Llama models and welcome feedback.

![](https://scontent-cdg4-1.xx.fbcdn.net/v/t39.2365-6/460942153_931942502081982_4461283719059292584_n.png?_nc_cat=108&ccb=1-7&_nc_sid=e280be&_nc_ohc=G_1RJkT7XgQQ7kNvwFxKi33&_nc_oc=AdodPKWsEnpcZCnCLga26hNvkVdsuBMQqBUigbpmVIJHEdrn1LlBcybc0-d-y5STKmkNq6l1CESRwChtAwp-WaI9&_nc_zt=14&_nc_ht=scontent-cdg4-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQPCehAlX0Q5ZpnYcsESp9WUEfKj_6QghBDyRBnYxePwEg&oe=6AE885D5)

## System level safety

Taking an open approach has many benefits. It helps ensure that more people around the world can access the opportunities that AI provides, guards against concentrating power in the hands of a small few, and deploys technology more equitably and safely across society. As we continue to innovate, we also want to make sure we’re empowering developers to build safe and responsible systems.

Building on our previous release and continuous effort to support responsible innovation, today we’re adding new updates to our family of safeguards:

* First, we’re releasing Llama Guard 3 11B Vision, which is designed to support Llama 3.2’s new image understanding capability and filter text+image input prompts or text output responses to these prompts.
* Second, as we released 1B and 3B Llama models to be used in more constrained environments like on-device, we also optimized Llama Guard to drastically reduce its deployment cost. Llama Guard 3 1B is based on the Llama 3.2 1B model and has been pruned and quantized bringing its size from 2,858 MB down to 438 MB, making it more efficient than ever to deploy.

These new solutions are integrated into our reference implementations, demos, and applications and are ready for the open source community to use on day one.

[![](https://scontent-cdg6-1.xx.fbcdn.net/v/t15.5256-10/461286504_3795120387436397_5947879418794172056_n.jpg?_nc_cat=103&ccb=1-7&_nc_sid=b07905&_nc_ohc=n4ZYqKPS6tYQ7kNvwGEynUL&_nc_oc=AdpR3_z3LrYw6hB9siX-vBrVZShE7w0dEI2hlgRmfBIEuq_Br0JwsLRq2YULbv5nn1eHkCymqax7KVLbEfx_knwz&_nc_zt=23&_nc_ht=scontent-cdg6-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQMYZc4V5aTdlKJxyn7ZRQJdFs61_mnZbzyqB2ECuRKn4g&oe=6AD406DA)](https://video-cdg4-3.xx.fbcdn.net/o1/v/t2/f2/m412/AQM1G5_Tanm_kNvD6Om2ov1JIjaHXPasHjMWiAuVnIXk2Qh4cp1xgzdowVBYcgxTt2Fr0E3kPiRUUdXemoyauCo.mp4?_nc_cat=111&_nc_sid=8bf8fe&_nc_ht=video-cdg4-3.xx.fbcdn.net&_nc_ohc=_zpg5pBB_QoQ7kNvwGFolQi&efg=eyJ2ZW5jb2RlX3RhZyI6Inhwdl9wcm9ncmVzc2l2ZS5GQUNFQk9PSy4uQzMuNjA2LnN2ZV9zZCIsInhwdl9hc3NldF9pZCI6MTEwNjY0ODQzNzY5OTcxNywiYXNzZXRfYWdlX2RheXMiOjc0OCwidmlfdXNlY2FzZV9pZCI6MTAxMjgsImR1cmF0aW9uX3MiOjI5LCJ1cmxnZW5fc291cmNlIjoid3d3In0%3D&ccb=17-1&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&_nc_zt=28&oh=00_AQPVUp1k-MLaY4QQFeBwbW2m6rzGlnXYEErw5zh7Zav50g&oe=6AD41D2F&bitrate=123556&tag=sve_sd)

## Try Llama 3.2 today

Llama 3.2 is poised to reach more people than ever before and enable exciting new use cases. We believe sharing these models with the open source community isn’t enough. We want to make sure developers also have the tools they need to build with Llama responsibly. As part of our continued responsible release efforts, we’re offering developers new [<u>tools and resources</u>](https://ai.meta.com/blog/responsible-ai-connect-2024/), and as always, we’ll update best practices in our [<u>Responsible Use Guide</u>](https://ai.meta.com/static-resource/responsible-use-guide/).

We continue to share the latest advancements in the Llama ecosystem because we believe openness drives innovation and is good for developers, Meta, and the world. We’re excited to continue the conversations we’re having with our partners and the open source community, and as always, we can’t wait to see what the community builds using Llama 3.2 and Llama Stack.

*This work was supported by our partners across the AI community. We’d like to thank and acknowledge (in alphabetical order): Accenture, AMD, Arm, AWS, Cloudflare, Databricks, Dell, Deloitte, Fireworks.ai, Google Cloud, Groq, Hugging Face, IBM watsonx, Infosys, Intel, Kaggle, Lenovo, LMSYS, MediaTek, Microsoft Azure, NVIDIA, OctoAI, Ollama, Oracle Cloud, PwC, Qualcomm, Sarvam AI, Scale AI, Snowflake, Together AI, and UC Berkeley - vLLM Project.*

[Learn more on the Llama website](https://www.llama.com/)

[Visit Hugging Face](https://huggingface.co/meta-llama)

---

Share:

---

Our latest updates delivered to your inbox

[Subscribe](https://ai.facebook.com/subscribe/) to our newsletter to keep up with Meta AI news, events, research breakthroughs, and more.

Join us in the pursuit of what’s possible with AI.

[See all open positions](https://www.metacareers.com/jobs/?is_leadership=0&sub_teams%5B0%5D=Artificial+Intelligence&is_in_page=0&fbclid=IwAR0O8BF7opOj5gASJmwYVGalPPXTLu-6xrl9w00eC7Rarp2HQ9uEH8tERFw)

Related Posts

![](https://scontent-cdg4-1.xx.fbcdn.net/v/t39.2365-6/460981187_554072500307898_6342706179093701619_n.png?_nc_cat=104&ccb=1-7&_nc_sid=e280be&_nc_ohc=aMGUxBXS2IwQ7kNvwHkI4Fi&_nc_oc=AdryhYFKvwhgG3Y_ATEpMAT67Mdt-eVQQmsJP3EtMjJWc3gq2ZplYGpbJ0PTmF0DL2WXL1HqLmqaFeSOzmUBnBpF&_nc_zt=14&_nc_ht=scontent-cdg4-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQPrhlD5G09OGKcLu0NqwhC7epYvE5DiGSwPHedyd8n_pw&oe=6AE8878B)

Responsible AI

Connect 2024: The responsible approach we’re taking to generative AI

September 25, 2024

[Read post](https://ai.meta.com/blog/responsible-ai-connect-2024/)

![](https://scontent-cdg4-2.xx.fbcdn.net/v/t39.2365-6/457150402_870575128016623_8609219656406574252_n.png?_nc_cat=101&ccb=1-7&_nc_sid=e280be&_nc_ohc=XQy0cn4ClbcQ7kNvwGZtaFO&_nc_oc=AdrbgsSSMWTIQP9GYUy8D78vAh53d58ABEbpwiq6xKn7iN5YwgG230L1-oyBVqzOpsIE-a3bDd5sb-Kf--6UMlX0&_nc_zt=14&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQMCYre8D5ZmVW95sBHbkUjN17m3CYJ-JIfZ9DqW8BFCtA&oe=6AE88495)

With 10x growth since 2023, Llama is the leading engine of AI innovation

August 29, 2024

[Read post](https://ai.meta.com/blog/llama-usage-doubled-may-through-july-2024/)

![](https://scontent-cdg4-2.xx.fbcdn.net/v/t39.2365-6/460055422_2744099152427826_2112966215088891339_n.png?_nc_cat=109&ccb=1-7&_nc_sid=e280be&_nc_ohc=PX0Tx2glJi0Q7kNvwFKlX8a&_nc_oc=AdosUeugIBMtJtkIcNaOudNMPUGbK95mYzcRqSKPndN3BtZy_00zt_a_PIbkUZ2-B51ls5dFDFD24AGlCiMsPKxH&_nc_zt=14&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQOkLoaDmF1A8s3b8GQ2kcH8xXdJaA0LaKxE8AsBxOqIRA&oe=6AE877D1)

Open Source

Generate an entire app from a prompt using Together AI’s LlamaCoder

September 18, 2024

[Read post](https://ai.meta.com/blog/together-ai-llamacoder/)

[Meta AI](/meta-ai/assistant/)

[Assistant](/meta-ai/assistant/)

[Media Generation](/meta-ai/media-generation/)

[Vibes](/meta-ai/vibes/)

[Muse](/muse/)

[Agent](/muse/)

[AI agents explained](/learn/agentic-ai/what-are-ai-agents/)

[What is agentic AI](/learn/agentic-ai/what-is-agentic-ai/)

[Agentic AI examples](/learn/agentic-ai/agentic-ai-examples/)

[AI Research](/research)

[Overview](/research/)

[Projects](/research/#projects)

[Resources & tools](/resources/)

[Publications](/results/?content_types%5B0%5D=publication)

[GitHub](https://github.com/facebookresearch/)

Resources

[Blog](/blog/)

[Learning Hub](/learn/)

[Demos](https://aidemos.meta.com/)

[About](/about)

[Overview](/about/)

[Open Source](/opensourceai/)

[Careers](https://www.metacareers.com/jobs/?is_leadership=0&sub_teams[0]=Artificial%20Intelligence&is_in_page=0)

![](https://scontent-cdg6-1.xx.fbcdn.net/v/t39.2365-6/87524316_2677189655726266_6338721200264445952_n.svg?_nc_cat=103&ccb=1-7&_nc_sid=e280be&_nc_ohc=fVw4LJojBokQ7kNvwFHGVnP&_nc_oc=Adq_FqrmzOLBbVyY9TpCHyOK9kb6cRq9_0SOBrNwxD50ysrVhvxxU3w4ljPrOfIi146YsVQAwxygXJkBOr9DwFdz&_nc_zt=14&_nc_ht=scontent-cdg6-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQN4-vONkqxabmcLJNkG7_RDoFwcZ645kasG6AhXPT2o6A&oe=6AE88138)

[![](https://scontent-cdg4-2.xx.fbcdn.net/v/t39.8562-6/335682312_964107378293184_3093631164486164913_n.svg?_nc_cat=100&ccb=1-7&_nc_sid=e280be&_nc_ohc=VAw_XcNwj14Q7kNvwGAvPpA&_nc_oc=AdqPe9jJhcQ_9FZmlK_b5V6dyMUoyrv2C3sK01M_y2_S4GfJRSo22lSH2tQZRqZToIcDkVZCpWi_OcMIwxTAMMkD&_nc_zt=14&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQPmVXjfena06NgIQ36cEWwi8BQ2qKzLbKFmF5-HzVOe7w&oe=6AD407A7)

![](https://scontent-cdg4-2.xx.fbcdn.net/v/t39.8562-6/335682312_964107378293184_3093631164486164913_n.svg?_nc_cat=100&ccb=1-7&_nc_sid=e280be&_nc_ohc=VAw_XcNwj14Q7kNvwGAvPpA&_nc_oc=AdqPe9jJhcQ_9FZmlK_b5V6dyMUoyrv2C3sK01M_y2_S4GfJRSo22lSH2tQZRqZToIcDkVZCpWi_OcMIwxTAMMkD&_nc_zt=14&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQPmVXjfena06NgIQ36cEWwi8BQ2qKzLbKFmF5-HzVOe7w&oe=6AD407A7)](https://www.facebook.com/aiatmeta/)

[![](https://scontent-cdg6-1.xx.fbcdn.net/v/t39.8562-6/336009607_1870102080040414_6753977241281150924_n.svg?_nc_cat=103&ccb=1-7&_nc_sid=e280be&_nc_ohc=W3pE9xaYRcoQ7kNvwHW8mOf&_nc_oc=Adp81oB-q7INhHgvZ0zR0jM0FZYrrAde4Q5PLVLcgQ6md9ya9c9c7NTdbG53P8cIhZ7yHqhZdyLUx1jyYsDKDP-E&_nc_zt=14&_nc_ht=scontent-cdg6-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQMDm_D2DDkd9PWDXf9w5mI6d_FpVWbaAH3dXV3itImkkg&oe=6AD3FFE2)

![](https://scontent-cdg6-1.xx.fbcdn.net/v/t39.8562-6/336009607_1870102080040414_6753977241281150924_n.svg?_nc_cat=103&ccb=1-7&_nc_sid=e280be&_nc_ohc=W3pE9xaYRcoQ7kNvwHW8mOf&_nc_oc=Adp81oB-q7INhHgvZ0zR0jM0FZYrrAde4Q5PLVLcgQ6md9ya9c9c7NTdbG53P8cIhZ7yHqhZdyLUx1jyYsDKDP-E&_nc_zt=14&_nc_ht=scontent-cdg6-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQMDm_D2DDkd9PWDXf9w5mI6d_FpVWbaAH3dXV3itImkkg&oe=6AD3FFE2)](https://twitter.com/aiatmeta/)

[![](https://scontent-cdg4-2.xx.fbcdn.net/v/t39.8562-6/336289415_1541032296405649_2165099305308791297_n.svg?_nc_cat=109&ccb=1-7&_nc_sid=e280be&_nc_ohc=szNSkRClPB8Q7kNvwFhjCmE&_nc_oc=Adr1x8_3fh7990AVxCQeWlK3REQb_JZLW2FbUE7UzPAlOozirLev9d0w2M9TCHpkiEmBF18dRzUI1DmEwOq61UjY&_nc_zt=14&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQMH-RvySSDOledoODYFjCst6JDXMf7Qnlc1R2d9Ngomnw&oe=6AD42BBB)

![](https://scontent-cdg4-2.xx.fbcdn.net/v/t39.8562-6/336289415_1541032296405649_2165099305308791297_n.svg?_nc_cat=109&ccb=1-7&_nc_sid=e280be&_nc_ohc=szNSkRClPB8Q7kNvwFhjCmE&_nc_oc=Adr1x8_3fh7990AVxCQeWlK3REQb_JZLW2FbUE7UzPAlOozirLev9d0w2M9TCHpkiEmBF18dRzUI1DmEwOq61UjY&_nc_zt=14&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQMH-RvySSDOledoODYFjCst6JDXMf7Qnlc1R2d9Ngomnw&oe=6AD42BBB)](https://www.linkedin.com/showcase/aiatmeta)

[![](https://scontent-cdg4-1.xx.fbcdn.net/v/t39.8562-6/335648731_142576991793348_7786819189843639239_n.svg?_nc_cat=108&ccb=1-7&_nc_sid=e280be&_nc_ohc=kR8jmDz5Tu8Q7kNvwFvYsCe&_nc_oc=AdqB1fhgRdg6tWTXl6oOVaPw775bvD632sxkS4Dmb1iZn0KSQXTiNwgxhNeolmY3eYKpekxbosK4bQcK6a25HQzP&_nc_zt=14&_nc_ht=scontent-cdg4-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQNRD5OlWko7w2MOzyPpjuAXAHjwEidNTljmO52N6LJUIw&oe=6AD40CEE)

![](https://scontent-cdg4-1.xx.fbcdn.net/v/t39.8562-6/335648731_142576991793348_7786819189843639239_n.svg?_nc_cat=108&ccb=1-7&_nc_sid=e280be&_nc_ohc=kR8jmDz5Tu8Q7kNvwFvYsCe&_nc_oc=AdqB1fhgRdg6tWTXl6oOVaPw775bvD632sxkS4Dmb1iZn0KSQXTiNwgxhNeolmY3eYKpekxbosK4bQcK6a25HQzP&_nc_zt=14&_nc_ht=scontent-cdg4-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQNRD5OlWko7w2MOzyPpjuAXAHjwEidNTljmO52N6LJUIw&oe=6AD40CEE)](https://www.youtube.com/%40aiatmeta)

Meta AI

[Meta AI](/meta-ai/assistant/)[Assistant](/meta-ai/assistant/)[Media Generation](/meta-ai/media-generation/)[Vibes](/meta-ai/vibes/)

Muse

[Muse](/muse/)[Agent](/muse/)[AI agents explained](/learn/agentic-ai/what-are-ai-agents/)[What is agentic AI](/learn/agentic-ai/what-is-agentic-ai/)[Agentic AI examples](/learn/agentic-ai/agentic-ai-examples/)

AI Research

[AI Research](/research)[Overview](/research/)[Projects](/research/#projects)[Resources & tools](/resources/)[Publications](/results/?content_types%5B0%5D=publication)[GitHub](https://github.com/facebookresearch/)

Resources

[Blog](/blog/)[Learning Hub](/learn/)[Demos](https://aidemos.meta.com/)

About

[About](/about)[Overview](/about/)[Open Source](/opensourceai/)[Careers](https://www.metacareers.com/jobs/?is_leadership=0&sub_teams[0]=Artificial%20Intelligence&is_in_page=0)

[![](https://scontent-cdg4-2.xx.fbcdn.net/v/t39.8562-6/335682312_964107378293184_3093631164486164913_n.svg?_nc_cat=100&ccb=1-7&_nc_sid=e280be&_nc_ohc=VAw_XcNwj14Q7kNvwGAvPpA&_nc_oc=AdqPe9jJhcQ_9FZmlK_b5V6dyMUoyrv2C3sK01M_y2_S4GfJRSo22lSH2tQZRqZToIcDkVZCpWi_OcMIwxTAMMkD&_nc_zt=14&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQPmVXjfena06NgIQ36cEWwi8BQ2qKzLbKFmF5-HzVOe7w&oe=6AD407A7)

![](https://scontent-cdg4-2.xx.fbcdn.net/v/t39.8562-6/335682312_964107378293184_3093631164486164913_n.svg?_nc_cat=100&ccb=1-7&_nc_sid=e280be&_nc_ohc=VAw_XcNwj14Q7kNvwGAvPpA&_nc_oc=AdqPe9jJhcQ_9FZmlK_b5V6dyMUoyrv2C3sK01M_y2_S4GfJRSo22lSH2tQZRqZToIcDkVZCpWi_OcMIwxTAMMkD&_nc_zt=14&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQPmVXjfena06NgIQ36cEWwi8BQ2qKzLbKFmF5-HzVOe7w&oe=6AD407A7)](https://www.facebook.com/aiatmeta/)

[![](https://scontent-cdg6-1.xx.fbcdn.net/v/t39.8562-6/336009607_1870102080040414_6753977241281150924_n.svg?_nc_cat=103&ccb=1-7&_nc_sid=e280be&_nc_ohc=W3pE9xaYRcoQ7kNvwHW8mOf&_nc_oc=Adp81oB-q7INhHgvZ0zR0jM0FZYrrAde4Q5PLVLcgQ6md9ya9c9c7NTdbG53P8cIhZ7yHqhZdyLUx1jyYsDKDP-E&_nc_zt=14&_nc_ht=scontent-cdg6-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQMDm_D2DDkd9PWDXf9w5mI6d_FpVWbaAH3dXV3itImkkg&oe=6AD3FFE2)

![](https://scontent-cdg6-1.xx.fbcdn.net/v/t39.8562-6/336009607_1870102080040414_6753977241281150924_n.svg?_nc_cat=103&ccb=1-7&_nc_sid=e280be&_nc_ohc=W3pE9xaYRcoQ7kNvwHW8mOf&_nc_oc=Adp81oB-q7INhHgvZ0zR0jM0FZYrrAde4Q5PLVLcgQ6md9ya9c9c7NTdbG53P8cIhZ7yHqhZdyLUx1jyYsDKDP-E&_nc_zt=14&_nc_ht=scontent-cdg6-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQMDm_D2DDkd9PWDXf9w5mI6d_FpVWbaAH3dXV3itImkkg&oe=6AD3FFE2)](https://twitter.com/aiatmeta/)

[![](https://scontent-cdg4-2.xx.fbcdn.net/v/t39.8562-6/336289415_1541032296405649_2165099305308791297_n.svg?_nc_cat=109&ccb=1-7&_nc_sid=e280be&_nc_ohc=szNSkRClPB8Q7kNvwFhjCmE&_nc_oc=Adr1x8_3fh7990AVxCQeWlK3REQb_JZLW2FbUE7UzPAlOozirLev9d0w2M9TCHpkiEmBF18dRzUI1DmEwOq61UjY&_nc_zt=14&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQMH-RvySSDOledoODYFjCst6JDXMf7Qnlc1R2d9Ngomnw&oe=6AD42BBB)

![](https://scontent-cdg4-2.xx.fbcdn.net/v/t39.8562-6/336289415_1541032296405649_2165099305308791297_n.svg?_nc_cat=109&ccb=1-7&_nc_sid=e280be&_nc_ohc=szNSkRClPB8Q7kNvwFhjCmE&_nc_oc=Adr1x8_3fh7990AVxCQeWlK3REQb_JZLW2FbUE7UzPAlOozirLev9d0w2M9TCHpkiEmBF18dRzUI1DmEwOq61UjY&_nc_zt=14&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQMH-RvySSDOledoODYFjCst6JDXMf7Qnlc1R2d9Ngomnw&oe=6AD42BBB)](https://www.linkedin.com/showcase/aiatmeta)

[![](https://scontent-cdg4-1.xx.fbcdn.net/v/t39.8562-6/335648731_142576991793348_7786819189843639239_n.svg?_nc_cat=108&ccb=1-7&_nc_sid=e280be&_nc_ohc=kR8jmDz5Tu8Q7kNvwFvYsCe&_nc_oc=AdqB1fhgRdg6tWTXl6oOVaPw775bvD632sxkS4Dmb1iZn0KSQXTiNwgxhNeolmY3eYKpekxbosK4bQcK6a25HQzP&_nc_zt=14&_nc_ht=scontent-cdg4-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQNRD5OlWko7w2MOzyPpjuAXAHjwEidNTljmO52N6LJUIw&oe=6AD40CEE)

![](https://scontent-cdg4-1.xx.fbcdn.net/v/t39.8562-6/335648731_142576991793348_7786819189843639239_n.svg?_nc_cat=108&ccb=1-7&_nc_sid=e280be&_nc_ohc=kR8jmDz5Tu8Q7kNvwFvYsCe&_nc_oc=AdqB1fhgRdg6tWTXl6oOVaPw775bvD632sxkS4Dmb1iZn0KSQXTiNwgxhNeolmY3eYKpekxbosK4bQcK6a25HQzP&_nc_zt=14&_nc_ht=scontent-cdg4-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQNRD5OlWko7w2MOzyPpjuAXAHjwEidNTljmO52N6LJUIw&oe=6AD40CEE)](https://www.youtube.com/%40aiatmeta)

[Privacy Policy](https://www.facebook.com/about/privacy/)

[Terms](https://www.facebook.com/policies/)

[Cookies](https://www.facebook.com/policies/cookies/)

Meta © 2026

[![](https://scontent-cdg4-2.xx.fbcdn.net/v/t39.8562-6/335682312_964107378293184_3093631164486164913_n.svg?_nc_cat=100&ccb=1-7&_nc_sid=e280be&_nc_ohc=VAw_XcNwj14Q7kNvwGAvPpA&_nc_oc=AdqPe9jJhcQ_9FZmlK_b5V6dyMUoyrv2C3sK01M_y2_S4GfJRSo22lSH2tQZRqZToIcDkVZCpWi_OcMIwxTAMMkD&_nc_zt=14&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQPmVXjfena06NgIQ36cEWwi8BQ2qKzLbKFmF5-HzVOe7w&oe=6AD407A7)

![](https://scontent-cdg4-2.xx.fbcdn.net/v/t39.8562-6/335682312_964107378293184_3093631164486164913_n.svg?_nc_cat=100&ccb=1-7&_nc_sid=e280be&_nc_ohc=VAw_XcNwj14Q7kNvwGAvPpA&_nc_oc=AdqPe9jJhcQ_9FZmlK_b5V6dyMUoyrv2C3sK01M_y2_S4GfJRSo22lSH2tQZRqZToIcDkVZCpWi_OcMIwxTAMMkD&_nc_zt=14&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQPmVXjfena06NgIQ36cEWwi8BQ2qKzLbKFmF5-HzVOe7w&oe=6AD407A7)](https://www.facebook.com/aiatmeta/)

[![](https://scontent-cdg6-1.xx.fbcdn.net/v/t39.8562-6/336009607_1870102080040414_6753977241281150924_n.svg?_nc_cat=103&ccb=1-7&_nc_sid=e280be&_nc_ohc=W3pE9xaYRcoQ7kNvwHW8mOf&_nc_oc=Adp81oB-q7INhHgvZ0zR0jM0FZYrrAde4Q5PLVLcgQ6md9ya9c9c7NTdbG53P8cIhZ7yHqhZdyLUx1jyYsDKDP-E&_nc_zt=14&_nc_ht=scontent-cdg6-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQMDm_D2DDkd9PWDXf9w5mI6d_FpVWbaAH3dXV3itImkkg&oe=6AD3FFE2)

![](https://scontent-cdg6-1.xx.fbcdn.net/v/t39.8562-6/336009607_1870102080040414_6753977241281150924_n.svg?_nc_cat=103&ccb=1-7&_nc_sid=e280be&_nc_ohc=W3pE9xaYRcoQ7kNvwHW8mOf&_nc_oc=Adp81oB-q7INhHgvZ0zR0jM0FZYrrAde4Q5PLVLcgQ6md9ya9c9c7NTdbG53P8cIhZ7yHqhZdyLUx1jyYsDKDP-E&_nc_zt=14&_nc_ht=scontent-cdg6-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQMDm_D2DDkd9PWDXf9w5mI6d_FpVWbaAH3dXV3itImkkg&oe=6AD3FFE2)](https://twitter.com/aiatmeta/)

[![](https://scontent-cdg4-2.xx.fbcdn.net/v/t39.8562-6/336289415_1541032296405649_2165099305308791297_n.svg?_nc_cat=109&ccb=1-7&_nc_sid=e280be&_nc_ohc=szNSkRClPB8Q7kNvwFhjCmE&_nc_oc=Adr1x8_3fh7990AVxCQeWlK3REQb_JZLW2FbUE7UzPAlOozirLev9d0w2M9TCHpkiEmBF18dRzUI1DmEwOq61UjY&_nc_zt=14&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQMH-RvySSDOledoODYFjCst6JDXMf7Qnlc1R2d9Ngomnw&oe=6AD42BBB)

![](https://scontent-cdg4-2.xx.fbcdn.net/v/t39.8562-6/336289415_1541032296405649_2165099305308791297_n.svg?_nc_cat=109&ccb=1-7&_nc_sid=e280be&_nc_ohc=szNSkRClPB8Q7kNvwFhjCmE&_nc_oc=Adr1x8_3fh7990AVxCQeWlK3REQb_JZLW2FbUE7UzPAlOozirLev9d0w2M9TCHpkiEmBF18dRzUI1DmEwOq61UjY&_nc_zt=14&_nc_ht=scontent-cdg4-2.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQMH-RvySSDOledoODYFjCst6JDXMf7Qnlc1R2d9Ngomnw&oe=6AD42BBB)](https://www.linkedin.com/showcase/aiatmeta)

[![](https://scontent-cdg4-1.xx.fbcdn.net/v/t39.8562-6/335648731_142576991793348_7786819189843639239_n.svg?_nc_cat=108&ccb=1-7&_nc_sid=e280be&_nc_ohc=kR8jmDz5Tu8Q7kNvwFvYsCe&_nc_oc=AdqB1fhgRdg6tWTXl6oOVaPw775bvD632sxkS4Dmb1iZn0KSQXTiNwgxhNeolmY3eYKpekxbosK4bQcK6a25HQzP&_nc_zt=14&_nc_ht=scontent-cdg4-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQNRD5OlWko7w2MOzyPpjuAXAHjwEidNTljmO52N6LJUIw&oe=6AD40CEE)

![](https://scontent-cdg4-1.xx.fbcdn.net/v/t39.8562-6/335648731_142576991793348_7786819189843639239_n.svg?_nc_cat=108&ccb=1-7&_nc_sid=e280be&_nc_ohc=kR8jmDz5Tu8Q7kNvwFvYsCe&_nc_oc=AdqB1fhgRdg6tWTXl6oOVaPw775bvD632sxkS4Dmb1iZn0KSQXTiNwgxhNeolmY3eYKpekxbosK4bQcK6a25HQzP&_nc_zt=14&_nc_ht=scontent-cdg4-1.xx&_nc_gid=jhNhL6cqybbCjiK8dSUvTw&_nc_ss=7f20f&oh=00_AQNRD5OlWko7w2MOzyPpjuAXAHjwEidNTljmO52N6LJUIw&oe=6AD40CEE)](https://www.youtube.com/%40aiatmeta)