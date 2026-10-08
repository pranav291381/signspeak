# INCLUDE signs in Sign → Text

Sign → Text recognizes the 262 signs of the [INCLUDE dataset](https://zenodo.org/records/4010759) (AI4Bharat / IIT Madras, CC BY 4.0) with a trained model (`mobile/assets/signpacks/include.signpack`). This page lists every sign and how it did on recordings the model never saw. Text → ISL can show every one of them, as motion traced from one INCLUDE recording per sign (`mobile/assets/motions/include-motion.signpack`, see [`sign-packs.md`](sign-packs.md#motion-pack-for-text--isl)); the results below are about recognition only.

## How it was tested

- INCLUDE has about 16 videos per sign, recorded in sessions of three takes by Deaf students of one school. For each sign, the last recording session was held out for testing and the one before for validation.
- The model reads each sign whole, once the hands come down, with four small networks averaged (two GRUs and two transformers) (see [`architecture.md`](architecture.md) §6.5a). When to show a sign was chosen on the validation videos with a model trained without them; the model measured here was then also trained on the validation videos, and never on the test ones.
- Each held-out video was played frame by frame, with the signer standing still before and after, into the same recognition session as the app (`npm run tune:model -- --evaluate --split test`).
- Result on 730 held-out videos: **72.5% right on the first try, 5.5% wrong, 22% "not sure"**. Counting the signs the app offers for one tap (“Did you mean…?” when it is not sure, “Not right?” under a shown sign), the right sign was on screen for **94%** of them. A sign picked there is marked as chosen, not recognized.
- Training also used one video per sign, for 205 of the signs, from the [Indian Sign Language Dictionary](https://www.data.gov.in/resource/indian-sign-language-dictionary-till-january-2024) of ISLRTC (Government of India, Government Open Data License – India): a second source of signers. Those videos were never used for testing.
- The model in the app was then trained on every recording with the same settings; the figures here are from the held-out test.
- Test sessions may share signers with training sessions (INCLUDE does not say who signed what), and all signers come from one school, so people who sign differently (other regions, other schools) will see far fewer signs recognized: on a signer the model never saw (the [ISL Bible dictionary](https://huggingface.co/datasets/bridgeconn/sign-dictionary-isl) of Bridge Connectivity Solutions, CC BY-SA 4.0, with 197 videos of 156 of these signs) it was right on the first try 22% of the time and wrong 16%, with the right sign on screen for 50% (the previous model, trained on INCLUDE alone: 15%, 15% and 36%). The app has not been tested with users yet.

**works**: right on at least two thirds of its test videos (198 signs) · **sometimes**: right at least once (23) · **suggested**: never shown on its own, but offered in “Did you mean…?” (33) · **not yet**: neither (6) · **not tested**: no held-out session (2)

## Adjectives (36 of 59 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Alive | works | 4 of 4 right |
| Bad | works | 1 of 1 right |
| Beautiful | suggested | 0 of 4 right, 4 offered in “Did you mean…?” |
| Big / large | works | 3 of 3 right |
| Blind | sometimes | 1 of 4 right, 3 offered in “Did you mean…?” |
| Cheap | works | 1 of 1 right |
| Clean | sometimes | 2 of 4 right, 2 offered in “Did you mean…?” |
| Cold | sometimes | 1 of 3 right, 2 offered in “Did you mean…?” |
| Cool | works | 3 of 3 right |
| Curved | works | 4 of 4 right |
| Dead | works | 3 of 4 right, 1 offered in “Did you mean…?” |
| Deaf | suggested | 0 of 4 right, 3 offered in “Did you mean…?” |
| Deep | works | 3 of 4 right, 1 offered in “Did you mean…?” |
| Dirty | sometimes | 1 of 4 right, 3 offered in “Did you mean…?” |
| Dry | works | 3 of 3 right |
| Expensive | works | 4 of 4 right |
| Famous | works | 3 of 3 right |
| Fast | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Female | suggested | 0 of 4 right, 3 offered in “Did you mean…?”, 4 wrong |
| Flat | suggested | 0 of 4 right, 4 offered in “Did you mean…?”, 3 wrong |
| Good | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Happy | suggested | 0 of 3 right, 3 offered in “Did you mean…?” |
| Hard | suggested | 0 of 4 right, 3 offered in “Did you mean…?” |
| Healthy | works | 3 of 3 right |
| Heavy | sometimes | 1 of 4 right, 3 offered in “Did you mean…?” |
| High | works | 4 of 4 right |
| Hot | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Light | suggested | 0 of 4 right, 3 offered in “Did you mean…?” |
| Long | works | 3 of 3 right |
| Loose | not yet | 0 of 4 right |
| Loud | sometimes | 1 of 3 right, 2 offered in “Did you mean…?” |
| Low | sometimes | 2 of 4 right, 2 offered in “Did you mean…?” |
| Male | suggested | 0 of 4 right, 4 offered in “Did you mean…?”, 4 wrong |
| Mean | works | 4 of 4 right |
| Narrow | suggested | 0 of 1 right, 1 offered in “Did you mean…?” |
| New | works | 3 of 3 right |
| Nice | not tested |  |
| Old | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Poor | works | 4 of 4 right |
| Quiet | works | 3 of 3 right |
| Rich | works | 4 of 4 right |
| Sad | works | 3 of 4 right, 1 offered in “Did you mean…?” |
| Shallow | suggested | 0 of 4 right, 4 offered in “Did you mean…?” |
| Short | works | 3 of 3 right |
| Sick | works | 2 of 3 right |
| Slow | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Small / little | works | 3 of 3 right |
| Soft | works | 4 of 4 right |
| Strong | works | 4 of 4 right |
| Tall | works | 2 of 3 right |
| Thick | works | 4 of 4 right |
| Thin | not tested |  |
| Tight | sometimes | 2 of 4 right, 2 offered in “Did you mean…?” |
| Ugly | suggested | 0 of 4 right, 1 offered in “Did you mean…?”, 2 wrong |
| Warm | works | 3 of 3 right |
| Weak | sometimes | 1 of 4 right, 3 offered in “Did you mean…?” |
| Wet | works | 1 of 1 right |
| Wide | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Young | works | 3 of 3 right |

## Animals (6 of 8 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Animal | works | 2 of 2 right |
| Bird | works | 2 of 2 right |
| Cat | works | 2 of 2 right |
| Cow | works | 2 of 2 right |
| Dog | works | 2 of 2 right |
| Fish | sometimes | 1 of 2 right, 1 offered in “Did you mean…?” |
| Horse | works | 2 of 2 right |
| Mouse | suggested | 0 of 2 right, 2 offered in “Did you mean…?” |

## Clothes (9 of 10 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Clothing | works | 1 of 1 right |
| Dress | suggested | 0 of 1 right, 1 offered in “Did you mean…?” |
| Hat | works | 1 of 1 right |
| Pant | works | 1 of 1 right |
| Pocket | works | 1 of 1 right |
| Shirt | works | 1 of 1 right |
| Shoes | works | 1 of 1 right |
| Skirt | works | 1 of 1 right |
| Suit | works | 1 of 1 right |
| T-Shirt | works | 1 of 1 right |

## Colours (9 of 11 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Black | works | 1 of 1 right |
| Blue | suggested | 0 of 1 right, 1 offered in “Did you mean…?” |
| Brown | works | 1 of 1 right |
| Colour | works | 1 of 1 right |
| Green | works | 1 of 1 right |
| Grey | works | 1 of 1 right |
| Orange | works | 1 of 1 right |
| Pink | works | 1 of 1 right |
| Red | works | 1 of 1 right |
| White | works | 1 of 1 right |
| Yellow | suggested | 0 of 1 right, 1 offered in “Did you mean…?”, 1 wrong |

## Days and Time (12 of 21 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Afternoon | works | 3 of 3 right |
| Evening | works | 3 of 3 right |
| Friday | works | 2 of 3 right |
| Hour | works | 3 of 3 right |
| Minute | suggested | 0 of 3 right, 3 offered in “Did you mean…?”, 1 wrong |
| Monday | works | 3 of 3 right |
| Month | sometimes | 1 of 3 right |
| Morning | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Night | sometimes | 2 of 4 right |
| Saturday | suggested | 0 of 3 right, 3 offered in “Did you mean…?”, 1 wrong |
| Second | works | 6 of 9 right, 3 offered in “Did you mean…?” |
| Sunday | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Thursday | works | 3 of 3 right |
| Time | works | 4 of 4 right |
| Today | sometimes | 1 of 3 right, 2 offered in “Did you mean…?” |
| Tomorrow | not yet | 0 of 3 right, 2 wrong |
| Tuesday | suggested | 0 of 3 right, 3 offered in “Did you mean…?” |
| Wednesday | works | 3 of 3 right |
| Week | suggested | 0 of 3 right, 3 offered in “Did you mean…?” |
| Year | works | 3 of 4 right, 1 offered in “Did you mean…?” |
| Yesterday | sometimes | 1 of 3 right, 1 offered in “Did you mean…?” |

## Electronics (8 of 10 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Camera | works | 3 of 3 right |
| Cell phone | suggested | 0 of 3 right, 3 offered in “Did you mean…?” |
| Clock | suggested | 0 of 3 right, 1 offered in “Did you mean…?” |
| Computer | works | 3 of 3 right |
| Fan | works | 3 of 3 right |
| Lamp | works | 3 of 3 right |
| Laptop | works | 3 of 3 right |
| Radio | works | 3 of 3 right |
| Screen | works | 3 of 3 right |
| Television | works | 3 of 3 right |

## Greetings (9 of 9 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Alright | works | 3 of 3 right |
| Good Morning | works | 3 of 3 right |
| Good afternoon | works | 3 of 3 right |
| Good evening | works | 2 of 2 right |
| Good night | works | 4 of 4 right |
| Hello | works | 3 of 3 right |
| How are you | works | 3 of 3 right |
| Pleased | works | 4 of 4 right |
| Thank you | works | 4 of 4 right |

## Home (19 of 27 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Bag | works | 3 of 3 right |
| Bathroom | works | 3 of 3 right |
| Bed | works | 3 of 3 right |
| Bedroom | works | 3 of 3 right |
| Book | not yet | 0 of 3 right |
| Box | works | 3 of 3 right |
| Card | works | 3 of 3 right |
| Chair | suggested | 0 of 3 right, 3 offered in “Did you mean…?”, 3 wrong |
| Door | works | 3 of 3 right |
| Dream | works | 3 of 3 right |
| Gift | suggested | 0 of 3 right, 3 offered in “Did you mean…?”, 3 wrong |
| Key | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Kitchen | works | 3 of 3 right |
| Letter | works | 3 of 3 right |
| Lock | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Page | sometimes | 1 of 3 right, 2 offered in “Did you mean…?” |
| Paint | works | 3 of 3 right |
| Paper | works | 3 of 3 right |
| Pen | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Pencil | suggested | 0 of 3 right, 3 offered in “Did you mean…?”, 1 wrong |
| Photograph | not yet | 0 of 3 right, 2 wrong |
| Ring | suggested | 0 of 3 right, 3 offered in “Did you mean…?” |
| Soap | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Table | sometimes | 1 of 3 right, 2 offered in “Did you mean…?”, 1 wrong |
| Telephone | works | 3 of 3 right |
| Tool | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Window | works | 3 of 3 right |

## Jobs (14 of 16 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Actor | works | 3 of 3 right |
| Artist | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Author | works | 3 of 3 right |
| Doctor | works | 3 of 3 right |
| Job | works | 3 of 3 right |
| Lawyer | sometimes | 1 of 3 right, 2 offered in “Did you mean…?” |
| Manager | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Patient | works | 3 of 3 right |
| Police | works | 3 of 3 right |
| Priest | works | 3 of 3 right |
| Reporter | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Secretary | suggested | 0 of 3 right, 3 offered in “Did you mean…?” |
| Soldier | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Student | works | 3 of 3 right |
| Teacher | works | 3 of 3 right |
| Waiter | works | 3 of 3 right |

## Means of Transportation (7 of 9 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Bicycle | works | 2 of 2 right |
| Boat | works | 2 of 2 right |
| Bus | works | 2 of 2 right |
| Car | works | 2 of 2 right |
| Plane | sometimes | 1 of 2 right |
| Train | sometimes | 1 of 2 right, 1 offered in “Did you mean…?” |
| Train ticket | works | 2 of 2 right |
| Transportation | works | 2 of 2 right |
| Truck | works | 2 of 2 right |

## People (24 of 26 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Adult | works | 1 of 1 right |
| Baby | works | 1 of 1 right |
| Boy | works | 1 of 1 right |
| Brother | works | 1 of 1 right |
| Child | works | 1 of 1 right |
| Crowd | works | 1 of 1 right |
| Daughter | works | 1 of 1 right |
| Family | works | 1 of 1 right |
| Father | works | 1 of 1 right |
| Friend | suggested | 0 of 1 right, 1 offered in “Did you mean…?” |
| Girl | works | 1 of 1 right |
| Grandfather | works | 1 of 1 right |
| Grandmother | works | 1 of 1 right |
| Husband | works | 1 of 1 right |
| King | works | 1 of 1 right |
| Man | works | 1 of 1 right |
| Mother | works | 1 of 1 right |
| Neighbour | works | 1 of 1 right |
| Parent | suggested | 0 of 1 right, 1 offered in “Did you mean…?”, 1 wrong |
| Player | works | 1 of 1 right |
| President | works | 1 of 1 right |
| Queen | works | 1 of 1 right |
| Sister | works | 1 of 1 right |
| Son | works | 1 of 1 right |
| Wife | works | 1 of 1 right |
| Woman | works | 1 of 1 right |

## Places (16 of 19 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Bank | works | 4 of 4 right |
| City | works | 3 of 4 right, 1 offered in “Did you mean…?” |
| Court | works | 5 of 5 right |
| Ground | works | 5 of 5 right |
| Hospital | works | 4 of 4 right |
| House | works | 4 of 4 right |
| India | works | 5 of 5 right |
| Library | works | 4 of 4 right |
| Location | sometimes | 2 of 4 right, 2 offered in “Did you mean…?” |
| Market | sometimes | 2 of 4 right, 2 offered in “Did you mean…?” |
| Office | sometimes | 1 of 4 right, 3 offered in “Did you mean…?” |
| Park | works | 5 of 5 right |
| Restaurant | works | 3 of 4 right, 1 offered in “Did you mean…?” |
| School | works | 4 of 4 right |
| Store / Shop | works | 6 of 6 right |
| Street / Road | works | 4 of 4 right |
| Temple | works | 4 of 5 right |
| Train Station | works | 4 of 4 right |
| University | works | 5 of 5 right |

## Pronouns (7 of 8 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| He | works | 3 of 3 right |
| I | works | 1 of 1 right |
| It | works | 3 of 3 right |
| She | works | 3 of 3 right |
| They | works | 3 of 3 right |
| We | works | 3 of 3 right |
| You | suggested | 0 of 4 right, 1 offered in “Did you mean…?”, 4 wrong |
| You (plural) | works | 2 of 3 right, 1 offered in “Did you mean…?” |

## Seasons (3 of 6 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Fall | not yet | 0 of 4 right, 1 wrong |
| Monsoon | works | 3 of 3 right |
| Season | works | 3 of 3 right |
| Spring | suggested | 0 of 3 right, 3 offered in “Did you mean…?” |
| Summer | works | 3 of 3 right |
| Winter | suggested | 0 of 3 right, 3 offered in “Did you mean…?”, 2 wrong |

## Society (19 of 23 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Attack | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Ball | works | 4 of 4 right |
| Bill | works | 3 of 3 right |
| Death | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Election | works | 3 of 3 right |
| Energy | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Exercise | works | 3 of 3 right |
| God | not yet | 0 of 3 right |
| Gun | sometimes | 1 of 3 right, 2 offered in “Did you mean…?” |
| Marriage | works | 3 of 3 right |
| Medicine | works | 3 of 3 right |
| Money | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Newspaper | works | 3 of 3 right |
| Peace | works | 3 of 3 right |
| Price | works | 3 of 3 right |
| Race (ethnicity) | suggested | 0 of 3 right, 3 offered in “Did you mean…?”, 3 wrong |
| Religion | works | 3 of 3 right |
| Science | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| Sign | suggested | 0 of 3 right, 3 offered in “Did you mean…?”, 1 wrong |
| Sport | works | 3 of 3 right |
| Team | works | 3 of 3 right |
| Technology | works | 2 of 3 right, 1 offered in “Did you mean…?” |
| War | works | 3 of 3 right |

